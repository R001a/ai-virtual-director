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

    const data = await apiResponse.json();
    if (!apiResponse.ok) {
      response.status(apiResponse.status).json({ error: data?.error?.message || `API 请求失败 (${apiResponse.status})` });
      return;
    }

    response.status(200).json({ images: extractImages(data), raw: data });
  } catch (error) {
    response.status(500).json({ error: error?.message || '生图失败' });
  }
}
