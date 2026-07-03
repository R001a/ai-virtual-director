import { createHash, createHmac, randomUUID } from 'node:crypto';

const endpoint = `${process.env.CPASS_BASE_URL || 'https://api.cpass.cc'}/v1beta/models/${process.env.CPASS_GEMINI_IMAGE_MODEL || 'gemini-3-pro-image-preview'}:generateContent`;

const imageToPart = image => {
  const source = typeof image === 'string' ? image : image?.image;
  if (!source) return null;
  const match = source.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    inline_data: {
      mime_type: match[1],
      data: match[2],
    },
  };
};

const extractImages = data => {
  const parts = data?.candidates?.flatMap(candidate => candidate?.content?.parts || []) || [];
  return parts.flatMap(part => {
    const inline = part.inline_data || part.inlineData;
    const file = part.file_data || part.fileData;
    if (inline?.data) {
      const mimeType = inline.mime_type || inline.mimeType || 'image/png';
      return [`data:${mimeType};base64,${inline.data}`];
    }
    if (file?.file_uri || file?.fileUri) {
      return [file.file_uri || file.fileUri];
    }
    if (part.text) {
      return part.text.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g) || [];
    }
    return [];
  });
};

const parseJsonResponse = async apiResponse => {
  const text = await apiResponse.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: { message: text || `API request failed (${apiResponse.status})` } };
  }
};

const hmacSha1 = (key, value, encoding = 'hex') => createHmac('sha1', key).update(value).digest(encoding);
const sha1 = value => createHash('sha1').update(value).digest('hex');

const encodeCosPath = key => `/${key.split('/').map(encodeURIComponent).join('/')}`;

const createCosAuthorization = ({ method, key, host, mimeType, secretId, secretKey }) => {
  const now = Math.floor(Date.now() / 1000);
  const signTime = `${now - 60};${now + 900}`;
  const pathname = encodeCosPath(key);
  const headerList = 'content-type;host';
  const headers = `content-type=${encodeURIComponent(mimeType).toLowerCase()}&host=${host}`;
  const httpString = `${method.toLowerCase()}\n${pathname}\n\n${headers}\n`;
  const stringToSign = `sha1\n${signTime}\n${sha1(httpString)}\n`;
  const signKey = hmacSha1(secretKey, signTime);
  const signature = hmacSha1(signKey, stringToSign);
  return [
    'q-sign-algorithm=sha1',
    `q-ak=${secretId}`,
    `q-sign-time=${signTime}`,
    `q-key-time=${signTime}`,
    `q-header-list=${headerList}`,
    'q-url-param-list=',
    `q-signature=${signature}`,
  ].join('&');
};

const uploadDataImageToCos = async (dataUrl, index) => {
  const secretId = process.env.COS_SECRET_ID;
  const secretKey = process.env.COS_SECRET_KEY;
  const bucket = process.env.COS_BUCKET;
  const region = process.env.COS_REGION || 'ap-shanghai';
  const publicBaseUrl = process.env.COS_PUBLIC_BASE_URL;
  const prefix = (process.env.COS_UPLOAD_PREFIX || 'ai-virtual-director/generated').replace(/^\/+|\/+$/g, '');

  if (!secretId || !secretKey || !bucket || !publicBaseUrl) {
    throw new Error('Missing COS upload environment variables');
  }

  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return dataUrl;

  const mimeType = match[1] || 'image/jpeg';
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const buffer = Buffer.from(match[2], 'base64');
  const date = new Date().toISOString().slice(0, 10);
  const key = `${prefix}/${date}/${Date.now()}-${index + 1}-${randomUUID()}.${ext}`;
  const host = `${bucket}.cos.${region}.myqcloud.com`;
  const url = `https://${host}${encodeCosPath(key)}`;
  const authorization = createCosAuthorization({
    method: 'PUT',
    key,
    host,
    mimeType,
    secretId,
    secretKey,
  });

  const uploadResponse = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: authorization,
      'Content-Type': mimeType,
      'Content-Length': String(buffer.length),
    },
    body: buffer,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(`COS 上传失败 (${uploadResponse.status}): ${errorText.slice(0, 300)}`);
  }

  return `${publicBaseUrl.replace(/\/+$/g, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
};

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const apiKey = process.env.CPASS_API_KEY;
    const expectedPassword = process.env.GENERATE_PASSWORD || 'rock';
    if (!apiKey) {
      response.status(500).json({ error: 'Missing CPASS_API_KEY' });
      return;
    }
    if (request.body?.password !== expectedPassword) {
      response.status(401).json({ error: '生图密码错误' });
      return;
    }

    const prompt = request.body?.prompt || '';
    const referenceImages = Array.isArray(request.body?.referenceImages) ? request.body.referenceImages : [];
    const imageParts = referenceImages.map(imageToPart).filter(Boolean);

    const apiResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              ...imageParts,
            ],
          },
        ],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio: process.env.CPASS_IMAGE_ASPECT_RATIO || '2:3',
            imageSize: process.env.CPASS_IMAGE_SIZE || '2K',
          },
        },
      }),
    });

    const data = await parseJsonResponse(apiResponse);
    if (!apiResponse.ok) {
      response.status(apiResponse.status).json({ error: data?.error?.message || `API 请求失败 (${apiResponse.status})` });
      return;
    }

    const images = extractImages(data);
    const uploadedImages = await Promise.all(images.map(uploadDataImageToCos));
    response.status(200).json({ images: uploadedImages, imageCount: uploadedImages.length });
  } catch (error) {
    response.status(500).json({ error: error?.message || '生图失败' });
  }
}
