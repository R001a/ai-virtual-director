import React, { useEffect, useMemo, useRef, useState } from 'react';

const cos = 'https://rock-1392994282.cos.ap-shanghai.myqcloud.com/AI%E4%BA%BA%E7%89%A9%E8%B5%84%E4%BA%A7%E5%BA%93';
const workflowUrl = 'https://aeye.bytedance.net/flow?id=6a3ca66f4631de0045ef6263';
const STORAGE_KEY = 'ai-virtual-director-draft-v1';
const IMAGE_DB_NAME = 'ai-virtual-director-images';
const IMAGE_DB_STORE = 'images';
const IMAGE_DB_VERSION = 1;

const createInitialConfig = () => ({
  gender: 'female',
  model: null,
  customModel: null,
  outfitImg: '',
  propImg: '',
  outfitPromptText: '',
  propPromptText: '',
  poseCat: 'normal',
  poseId: null,
  poseImgUrl: '',
  posePromptText: '',
  camera: null,
  expression: null,
  makeup: null,
});

const loadDraft = () => {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
};

const openImageDb = () => new Promise((resolve, reject) => {
  if (typeof window === 'undefined' || !window.indexedDB) {
    reject(new Error('IndexedDB unavailable'));
    return;
  }
  const request = window.indexedDB.open(IMAGE_DB_NAME, IMAGE_DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(IMAGE_DB_STORE)) {
      db.createObjectStore(IMAGE_DB_STORE);
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const imageDbRequest = async (mode, action) => {
  const db = await openImageDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGE_DB_STORE, mode);
    const store = tx.objectStore(IMAGE_DB_STORE);
    const request = action(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

const imageDbGet = key => imageDbRequest('readonly', store => store.get(key)).catch(() => null);
const imageDbSet = (key, value) => imageDbRequest('readwrite', store => store.put(value, key));
const imageDbDelete = key => imageDbRequest('readwrite', store => store.delete(key));
const imageDbClear = () => imageDbRequest('readwrite', store => store.clear()).catch(() => {});
const isLocalImageData = value => typeof value === 'string' && /^(data:|blob:)/.test(value);

const sanitizeDraftConfig = config => {
  const next = {
    ...config,
    outfitImg: '',
    propImg: '',
    poseImgUrl: isLocalImageData(config.poseImgUrl) ? '' : config.poseImgUrl,
  };
  if (next.customModel?.refImg) {
    next.customModel = {
      ...next.customModel,
      refImg: isLocalImageData(next.customModel.refImg) ? '' : next.customModel.refImg,
    };
  }
  return next;
};

const saveImageCache = async (config, generatedImages) => {
  const entries = [
    ['config.outfitImg', config.outfitImg],
    ['config.propImg', config.propImg],
    ['config.poseImgUrl', isLocalImageData(config.poseImgUrl) ? config.poseImgUrl : ''],
    ['config.customModel.refImg', config.customModel?.refImg || ''],
    ['generatedImages', generatedImages],
  ];

  await Promise.all(entries.map(([key, value]) => {
    if (Array.isArray(value) ? value.length : value) {
      return imageDbSet(key, value);
    }
    return imageDbDelete(key);
  }));
};

const DATA = {
  models: {
    female: [
      { id: 'f1', name: 'Mia', desc: '高级冷感，商业 KV 适用', fullImg: `${cos}/%E6%A8%A1%E7%89%B9%E5%85%A8/%E5%A5%B3A.jpg`, halfImg: `${cos}/%E6%A8%A1%E7%89%B9%E5%85%A8/%E5%A5%B3A01.jpg` },
      { id: 'f2', name: 'Chloe', desc: '清冷骨相，极简产品适用', fullImg: `${cos}/%E6%A8%A1%E7%89%B9%E5%85%A8/%E5%A5%B3B.jpg`, halfImg: `${cos}/%E6%A8%A1%E7%89%B9%E5%85%A8/%E5%A5%B3B01.jpg` },
      { id: 'f3', name: 'Luna', desc: '阳光活力，休闲新品适用', fullImg: `${cos}/%E6%A8%A1%E7%89%B9%E5%85%A8/%E5%A5%B3C.jpg`, halfImg: `${cos}/%E6%A8%A1%E7%89%B9%E5%85%A8/%E5%A5%B3C01.jpg` },
    ],
    male: [
      { id: 'm1', name: 'Leo', desc: '硬朗轮廓，商务新品适用', fullImg: `${cos}/%E6%A8%A1%E7%89%B9%E5%85%A8/%E7%94%B7A.jpg`, halfImg: `${cos}/%E6%A8%A1%E7%89%B9%E5%85%A8/%E7%94%B7A01.jpg` },
      { id: 'm2', name: 'Julian', desc: '斯文质感，轻奢新品适用', fullImg: `${cos}/%E6%A8%A1%E7%89%B9%E5%85%A8/%E7%94%B7B.jpg`, halfImg: `${cos}/%E6%A8%A1%E7%89%B9%E5%85%A8/%E7%94%B7B01.jpg` },
      { id: 'm3', name: 'Arthur', desc: '潮流个性，街头新品适用', fullImg: `${cos}/%E6%A8%A1%E7%89%B9%E5%85%A8/%E7%94%B7C.jpg`, halfImg: `${cos}/%E6%A8%A1%E7%89%B9%E5%85%A8/%E7%94%B7C01.jpg` },
    ],
  },
  poseCategories: [
    { id: 'normal', label: '常规姿势' },
    { id: 'dynamic', label: '动态姿势' },
    { id: 'special', label: '特殊姿势' },
  ],
  poseImages: {
    normal: [
      ...[13, 15, 16, 17, 18, 19, 2, 3, 4, 5, 6, 8].map(n => `${cos}/%E4%BA%BA%E7%89%A9%E5%8A%A8%E4%BD%9C/%E5%B8%B8%E8%A7%84/%E7%94%BB%E6%9D%BF%20${n}.jpg`),
      `${cos}/%E4%BA%BA%E7%89%A9%E5%8A%A8%E4%BD%9C/%E5%8A%A8%E6%80%81/%E6%89%93%E7%94%B5%E8%AF%9D.png`,
    ],
    dynamic: [1, 12, 14, 20, 7, 9].map(n => `${cos}/%E4%BA%BA%E7%89%A9%E5%8A%A8%E4%BD%9C/%E5%8A%A8%E6%80%81/%E7%94%BB%E6%9D%BF%20${n}.jpg`),
    special: [10, 11, 21].map(n => `${cos}/%E4%BA%BA%E7%89%A9%E5%8A%A8%E4%BD%9C/%E7%89%B9%E6%AE%8A/%E7%94%BB%E6%9D%BF%20${n}.jpg`),
  },
  camera: [
    { id: 'eye', label: '平拍', prompt: '平视视角，自然的观察角度，水平构图。' },
    { id: 'slight_high', label: '轻微俯拍', prompt: '轻微俯拍视角，从略高于被摄主体的位置拍摄，轻微的下倾角度，展现主体的顶部细节' },
    { id: 'slight_low', label: '轻微仰拍', prompt: '轻微仰拍视角，从略低于被摄主体的位置拍摄，轻微的上倾角度，突出主体的高度感' },
    { id: 'high', label: '俯拍', prompt: '俯拍视角，完全从正上方垂直向下拍摄，平铺构图，平面化视觉，俯瞰全景，上帝视角。' },
    { id: 'low', label: '仰拍', prompt: '仰拍视角，从地面低位向上拍摄，极度夸张的透视感，压迫感' },
    { id: 'fisheye', label: '鱼眼', prompt: '鱼眼镜头效果，超广角畸变，球形透视，极度夸张的中心凸起效果，边缘弯曲，强烈的视觉冲击' },
  ],
  expressions: [
    { id: 'cold', label: '高级冷感', prompt: '保持人物长相，仅修改表情。人物表情为国际超模后台定妆照表情，冷感厌世脸，高级时尚感，眼神锐利且带有攻击性，眼睛微眯5%，下眼睑轻微发力，目光直视镜头，嘴唇自然闭合微抿，下颌线收紧，面部肌肉放松但充满气场。', img: `${cos}/%E5%A6%86%E5%AE%B9%E5%92%8C%E8%A1%A8%E6%83%85/%E8%A1%A8%E6%83%85%E9%83%A8%E5%88%86/%E9%AB%98%E7%BA%A7%E5%86%B7%E6%84%9F.png` },
    { id: 'natural', label: '自然微笑', prompt: '保持人物长相、五官、发型、身材完全不变，仅修改表情，微眯双眼，甜美而调皮的半笑，羞涩的神态，眼神清澈且带有笑意，温柔且具有感染力的笑容，放松且自然的状态。', img: `${cos}/%E5%A6%86%E5%AE%B9%E5%92%8C%E8%A1%A8%E6%83%85/%E8%A1%A8%E6%83%85%E9%83%A8%E5%88%86/%E6%9F%94%E5%92%8C%E5%BE%AE%E7%AC%91.png` },
    { id: 'sunny', label: '阳光笑容', prompt: '保持人物不变，仅修改表情：灿烂且真诚的露齿笑容，充满感染力的开怀大笑，自然真实感，眼神明亮充满光泽，直视镜头，表情自然且愉悦，散发出自信与活泼的青春气息，面部表情放松，毫无造作感。', img: `${cos}/%E5%A6%86%E5%AE%B9%E5%92%8C%E8%A1%A8%E6%83%85/%E8%A1%A8%E6%83%85%E9%83%A8%E5%88%86/%E9%98%B3%E5%85%89%E7%AC%91%E5%AE%B9.png` },
    { id: 'relax', label: '思考松弛', prompt: '保持人物不变，仅修改表情：眼神迷离且带有淡淡的慵懒感，看向远方，面部表情松弛，没有刻意的肌肉用力，呈现出一种若有所思、漫不经心或空灵的氛围感，仿佛刚从沉思中惊醒，带有明显的胶片电影质感。', img: `${cos}/%E5%A6%86%E5%AE%B9%E5%92%8C%E8%A1%A8%E6%83%85/%E8%A1%A8%E6%83%85%E9%83%A8%E5%88%86/%E6%80%9D%E8%80%83%E6%9D%BE%E5%BC%9B.png` },
    { id: 'focus', label: '神采奕奕', prompt: '保持人物不变，仅修改表情：慵懒，漫不经心，清纯、空灵、无辜感、眼神清澈且微带湿润、直视镜头、面部表情平和自然、微张的双唇透露出一点点慵懒与纯真、神态静谧柔和、自然光线下柔和的皮肤质感，冷静而带有疏离感', img: `${cos}/%E5%A6%86%E5%AE%B9%E5%92%8C%E8%A1%A8%E6%83%85/%E8%A1%A8%E6%83%85%E9%83%A8%E5%88%86/%E7%A5%9E%E9%87%87%E5%A5%95%E5%A5%95%E6%96%B0.png` },
    { id: 'playful', label: '灵动俏皮', prompt: '保持人物不变，仅修改表情：眼神清澈且带着微微笑意（眯眼笑），嘴角微微上扬，眼神柔和清澈而灵动，透着一丝俏皮与放松。头部略微向侧面倾斜，看向镜头，展现出一种随意的亲和力。整体神态既有初恋般的清纯感，又不失活泼的趣味。', img: `${cos}/%E5%A6%86%E5%AE%B9%E5%92%8C%E8%A1%A8%E6%83%85/%E8%A1%A8%E6%83%85%E9%83%A8%E5%88%86/%E7%81%B5%E5%8A%A8%E4%BF%8F%E7%9A%AE%E6%96%B0.png` },
    { id: 'interactive', label: '轻松互动', prompt: '仅修改表情。人物仿佛刚刚听到镜头外有人说话，目光自然看向对方方向，眼神带有轻微交流感和回应感。面部自然放松，嘴角微微上扬，似笑非笑。头部轻微侧转或轻微歪头，整体状态轻松、真实、生活化，具有杂志抓拍摄影中的自然互动感。', img: `${cos}/%E5%A6%86%E5%AE%B9%E5%92%8C%E8%A1%A8%E6%83%85/%E8%A1%A8%E6%83%85%E9%83%A8%E5%88%86/%E8%BD%BB%E6%9D%BE%E4%BA%92%E5%8A%A8.png` },
  ],
  makeup: [
    { id: 'nude', label: '自然裸妆', prompt: '极简自然素颜妆，干净透亮的皮肤，保留真实细腻的毛孔纹理，无明显妆感，伪素颜，饱满良好的精神状态，眼神清澈明亮，野生自然眉，裸色水润双唇，面色红润健康，清新自然的气质，柔和的晨间自然光，干净极简背景，写实人像摄影，逼真的光影效果。', img: `${cos}/%E5%A6%86%E5%AE%B9%E5%92%8C%E8%A1%A8%E6%83%85/%E5%A6%86%E5%AE%B9%E9%83%A8%E5%88%86/%E8%87%AA%E7%84%B6%E8%A3%B8%E5%A6%86.png` },
    { id: 'fresh', label: '清透元气妆', prompt: '肤质通透细腻，轻薄底妆，自然水光肌效果，双颊增加淡粉色腮红，位置偏苹果肌，眼周轻微提亮，睫毛自然纤长，浅棕色自然眼妆，眼神清透有神，增加元气感，唇部为自然蜜桃粉色，嘴唇带轻微水润光泽，整体妆感干净轻盈，清淡妆容，不改变人物五官与气质。', img: `${cos}/%E5%A6%86%E5%AE%B9%E5%92%8C%E8%A1%A8%E6%83%85/%E5%A6%86%E5%AE%B9%E9%83%A8%E5%88%86/%E6%B8%85%E9%80%8F%E5%85%83%E6%B0%94%E5%A6%86.png` },
    { id: 'refined', label: '精致妆容', prompt: '鼻梁与双颊大面积自然泛红，腮红横跨鼻梁与苹果肌，保留真实皮肤纹理，眼妆极淡，仅轻微提亮，上下睫毛自然浓密，唇部为裸杏色哑光口红，整体妆感年轻、健康、充满生命力。', img: `${cos}/%E5%A6%86%E5%AE%B9%E5%92%8C%E8%A1%A8%E6%83%85/%E5%A6%86%E5%AE%B9%E9%83%A8%E5%88%86/%E7%B2%BE%E8%87%B4%E6%97%B6%E5%B0%9A.png` },
    { id: 'trend', label: '个性潮流妆', prompt: '鼻梁与双颊大面积自然泛红，腮红横跨鼻梁与苹果肌，保留真实皮肤纹理，眼妆极淡，仅轻微提亮，上下睫毛自然浓密，唇部为裸杏色哑光口红，整体妆感年轻、健康、充满生命力。', img: `${cos}/%E5%A6%86%E5%AE%B9%E5%92%8C%E8%A1%A8%E6%83%85/%E5%A6%86%E5%AE%B9%E9%83%A8%E5%88%86/%E4%B8%AA%E6%80%A7%E6%BD%AE%E6%B5%81%E5%A6%86.png` },
    { id: 'nomakeup', label: '自然素颜', prompt: '极致清晰的脸部特写肖像，完美的自然裸妆，清透轻薄底妆，自然毛流感野生眉，低饱和度哑光裸色唇妆，极具真实的皮肤质感状态，保留微小毛孔与细腻肌肤纹理，原生清透美感，伪素颜，柔和的自然光照明，极简高级审美，8k分辨率，超写实微距摄影质感。', img: `${cos}/%E5%A6%86%E5%AE%B9%E5%92%8C%E8%A1%A8%E6%83%85/%E5%A6%86%E5%AE%B9%E9%83%A8%E5%88%86/%E8%87%AA%E7%84%B6%E8%A3%B8%E5%A6%86-%E7%94%B7.png` },
    { id: 'editorial', label: '时尚大片妆', prompt: '面部轮廓更加清晰立体，保留男性骨相特征，下颌线更加干净利落，鼻梁立体度轻微提升，肤质细腻干净，去除瑕疵但保留真实皮肤纹理，眉毛自然整理，眼周轻微提亮，唇色自然健康，不增加明显眼影，不增加明显眼线，时尚杂志封面、高级品牌广告感觉。', img: `${cos}/%E5%A6%86%E5%AE%B9%E5%92%8C%E8%A1%A8%E6%83%85/%E5%A6%86%E5%AE%B9%E9%83%A8%E5%88%86/%E6%97%B6%E5%B0%9A%E5%A4%A7%E7%89%87%E5%A6%86-%E7%94%B7.png` },
  ],
};

const extractDataImages = value => {
  if (typeof value !== 'string') return [];
  return value.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g) || [];
};

const cleanImageUrl = value => {
  if (typeof value !== 'string') return '';
  const extracted = extractDataImages(value);
  if (extracted.length) return extracted[0];
  return value.trim().replace(/^[("'\s]+|[)"'\s]+$/g, '');
};

const isImageUrl = value => /^(https?:|blob:|data:)/.test(cleanImageUrl(value));
const maleMakeupIds = ['nomakeup', 'editorial'];
const isMakeupAllowed = (gender, makeupId) => gender === 'male' ? maleMakeupIds.includes(makeupId) : !maleMakeupIds.includes(makeupId);

const normalizeGeneratedImages = data => {
  if (Array.isArray(data)) return data.map(cleanImageUrl).filter(Boolean);
  const geminiImages = data?.candidates?.flatMap(candidate => candidate?.content?.parts || []).flatMap(part => {
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
      return extractDataImages(part.text);
    }
    return [];
  }) || [];
  if (geminiImages.length) return geminiImages;
  if (Array.isArray(data?.images)) return data.images.map(cleanImageUrl).filter(Boolean);
  if (Array.isArray(data?.data?.images)) return data.data.images.map(cleanImageUrl).filter(Boolean);
  if (typeof data?.image === 'string') return [cleanImageUrl(data.image)];
  if (typeof data?.url === 'string') return [cleanImageUrl(data.url)];
  if (typeof data?.data?.url === 'string') return [cleanImageUrl(data.data.url)];
  if (typeof data?.base64 === 'string') return [`data:image/png;base64,${data.base64}`];
  return extractDataImages(JSON.stringify(data));
};

const summarizeApiResponse = data => {
  const textParts = data?.candidates?.flatMap(candidate => candidate?.content?.parts || [])
    .map(part => part.text)
    .filter(Boolean);
  if (textParts?.length) return textParts.join(' ').slice(0, 500);
  if (data?.error?.message) return data.error.message;
  if (typeof data?.error === 'string') return data.error;
  return JSON.stringify(data)?.slice(0, 500) || '空响应';
};

const compressImageDataUrl = (dataUrl, maxSize = 2304, quality = 0.86) => new Promise(resolve => {
  if (!dataUrl?.startsWith('data:image/')) {
    resolve(dataUrl);
    return;
  }
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    resolve(canvas.toDataURL('image/jpeg', quality));
  };
  img.onerror = () => resolve(dataUrl);
  img.src = dataUrl;
});

const imageToDataUrl = async imageUrl => {
  if (!imageUrl) return imageUrl;
  if (imageUrl.startsWith('data:')) return compressImageDataUrl(imageUrl);
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error('参考图读取失败，请检查图片是否可访问');
  }
  const blob = await response.blob();
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return compressImageDataUrl(dataUrl);
};

const parseApiResponse = async response => {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: { message: text || `API 请求失败 (${response.status})` } };
  }
};

const fileToDataUrl = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

function SectionCard({ step, title, children }) {
  return (
    <section className="mb-6 rounded-xl border border-zinc-800/70 bg-[#13151a] shadow-lg">
      <div className="flex items-center gap-3 rounded-t-xl border-b border-zinc-800/70 bg-[#181a20] px-6 py-4">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-cyan-500/20 font-mono text-xs font-bold text-cyan-400">{step}</span>
        <h2 className="text-base font-semibold tracking-wide text-zinc-200">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

function CheckDot({ active }) {
  return (
    <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${active ? 'border-cyan-400 bg-cyan-400' : 'border-zinc-600 bg-zinc-900'}`}>
      {active && <span className="h-1.5 w-1.5 rounded-full bg-black" />}
    </span>
  );
}

function UploadTile({ label, value, onUpload, onClear, tall = false }) {
  return (
    <div className={`relative overflow-hidden rounded-xl border border-dashed border-zinc-700 bg-zinc-950/40 ${tall ? 'h-80' : 'h-[320px]'}`}>
      {value && (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-3 top-3 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-zinc-700 bg-black/75 text-sm font-bold text-zinc-200 hover:border-cyan-400"
        >
          x
        </button>
      )}
      <label className="flex h-full w-full cursor-pointer flex-col items-center justify-center overflow-hidden">
        {value ? (
          <img src={value} alt={label} className="h-full w-full object-contain" />
        ) : (
          <>
            <span className="mb-2 text-3xl font-light text-zinc-600">+</span>
            <span className="text-sm font-semibold text-zinc-300">{label}</span>
            <span className="mt-1 text-xs text-zinc-500">临时展示，不写入图库</span>
          </>
        )}
        <input type="file" accept="image/*" className="hidden" onChange={onUpload} />
      </label>
    </div>
  );
}

function FaceOption({ item, active, color, disabled = false, onClick, onPreview, onLeave }) {
  const activeClass = color === 'indigo' ? 'border-indigo-500 text-indigo-300' : 'border-cyan-500 text-cyan-300';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-w-[220px] rounded-xl border bg-zinc-900 p-3 text-left transition ${disabled ? 'cursor-not-allowed opacity-55' : 'hover:border-zinc-500'} ${active ? activeClass : 'border-zinc-800 text-zinc-400'}`}
    >
      <div
        onMouseEnter={event => !disabled && onPreview(item.img, event)}
        onMouseLeave={onLeave}
        className="aspect-square w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950"
      >
        <img src={item.img} alt={item.label} className="h-full w-full object-cover" />
      </div>
      <div className="mt-3 text-center text-sm font-semibold">{item.label}</div>
    </button>
  );
}

export default function App() {
  const [config, setConfig] = useState(() => ({ ...createInitialConfig(), ...(loadDraft()?.config || {}) }));
  const [zoom, setZoom] = useState(null);
  const [hoverPreview, setHoverPreview] = useState(null);
  const [posePanelOpen, setPosePanelOpen] = useState(false);
  const [generatedImages, setGeneratedImages] = useState(() => loadDraft()?.generatedImages || []);
  const [outputCursor, setOutputCursor] = useState(() => loadDraft()?.outputCursor || 0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  const [generationError, setGenerationError] = useState('');
  const [cacheReady, setCacheReady] = useState(false);
  const hoverTimer = useRef(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      imageDbGet('config.outfitImg'),
      imageDbGet('config.propImg'),
      imageDbGet('config.poseImgUrl'),
      imageDbGet('config.customModel.refImg'),
      imageDbGet('generatedImages'),
    ]).then(([outfitImg, propImg, poseImgUrl, customModelRefImg, cachedGeneratedImages]) => {
      if (!active) return;
      setConfig(prev => ({
        ...prev,
        outfitImg: outfitImg || prev.outfitImg,
        propImg: propImg || prev.propImg,
        poseImgUrl: poseImgUrl || prev.poseImgUrl,
        customModel: prev.customModel && customModelRefImg
          ? { ...prev.customModel, refImg: customModelRefImg }
          : prev.customModel,
      }));
      if (Array.isArray(cachedGeneratedImages)) {
        setGeneratedImages(cachedGeneratedImages);
      }
    }).finally(() => {
      if (active) setCacheReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!cacheReady) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        config: sanitizeDraftConfig(config),
        generatedImages: [],
        outputCursor,
      }));
      saveImageCache(config, generatedImages).catch(() => {
        setGenerationError('浏览器图片缓存写入失败，部分图片可能无法在刷新后保留');
      });
    } catch (error) {
      setGenerationError('浏览器本地存储空间不足，部分图片可能无法在刷新后保留');
    }
  }, [cacheReady, config, generatedImages, outputCursor]);

  const updateConfig = (key, value) => setConfig(prev => ({ ...prev, [key]: value }));

  const clearConfig = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    imageDbClear();
    setConfig(createInitialConfig());
    setGeneratedImages([]);
    setOutputCursor(0);
    setGenerationStatus('');
    setGenerationError('');
    setZoom(null);
  };

  const setGender = gender => {
    setConfig(prev => ({
      ...prev,
      gender,
      model: null,
      customModel: null,
      makeup: prev.makeup && isMakeupAllowed(gender, prev.makeup.id) ? prev.makeup : null,
      poseCat: 'normal',
      poseId: null,
      poseImgUrl: '',
    }));
  };

  const uploadImage = async (key, event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    updateConfig(key, await fileToDataUrl(file));
    event.target.value = '';
  };

  const uploadCustomModel = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const refImg = await fileToDataUrl(file);
    setConfig(prev => ({
      ...prev,
      model: null,
      customModel: {
        id: 'custom',
        name: 'Custom Role',
        refImg,
        gender: prev.gender,
        shotType: 'full',
        fileName: file.name,
      },
    }));
    event.target.value = '';
  };

  const uploadCustomPose = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const poseImgUrl = await fileToDataUrl(file);
    setConfig(prev => ({
      ...prev,
      poseId: 'custom-upload',
      poseImgUrl,
    }));
    event.target.value = '';
  };

  const openHoverPreview = (img, event) => {
    if (!img) return;
    clearTimeout(hoverTimer.current);
    const rect = event.currentTarget.getBoundingClientRect();
    hoverTimer.current = window.setTimeout(() => {
      setHoverPreview({
        img,
        x: Math.min(window.innerWidth - 544, Math.max(24, rect.left + rect.width / 2 - 260)),
        y: Math.min(window.innerHeight - 544, Math.max(24, rect.top - 120)),
      });
    }, 1000);
  };

  const closeHoverPreview = () => {
    clearTimeout(hoverTimer.current);
    setHoverPreview(null);
  };

  const downloadImage = (img, name) => {
    if (!isImageUrl(img)) return;
    const link = document.createElement('a');
    link.href = img;
    link.download = `${name}.jpg`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleGenerate = async () => {
    if (isGenerating) return;
    if (!config.outfitImg) {
      setGenerationError('请先添加服饰参考图');
      setGenerationStatus('');
      return;
    }

    const referenceImages = await Promise.all(promptData.chain
      .filter(ref => ref.hasData)
      .map(async (ref, index) => ({
        index: index + 1,
        type: ref.id,
        label: ref.label,
        image: await imageToDataUrl(ref.img),
      })));

    setIsGenerating(true);
    setGenerationError('');
    setGenerationStatus('正在上传参考图并生成，请稍候');

    try {
      let password = window.sessionStorage.getItem('ai-virtual-director-password') || '';
      if (!password) {
        password = window.prompt('请输入生图密码') || '';
        if (password) {
          window.sessionStorage.setItem('ai-virtual-director-password', password);
        }
      }
      if (!password) {
        throw new Error('请输入生图密码');
      }

      const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          prompt: promptData.main,
          referenceImages,
          imageCount: 1,
        }),
      });

      const data = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(data?.error?.message || data?.error || `API 请求失败 (${response.status})`);
      }
      const images = normalizeGeneratedImages(data).map(cleanImageUrl).filter(isImageUrl);

      if (!images.length) {
        throw new Error(`API 未返回可展示的图片：${summarizeApiResponse(data)}`);
      }

      const startCursor = outputCursor;
      setGeneratedImages(prev => {
        const next = [...prev].slice(0, 3);
        let cursor = startCursor;
        images.forEach(img => {
          next[cursor % 3] = img;
          cursor += 1;
        });
        return next;
      });
      setOutputCursor((startCursor + images.length) % 3);
      setGenerationStatus('生成完成');
    } catch (error) {
      setGenerationError(error?.message || '生图失败，请重试');
      setGenerationStatus('');
    } finally {
      setIsGenerating(false);
    }
  };

  const promptData = useMemo(() => {
    const character = config.model || config.customModel;
    const genderName = config.gender === 'female' ? '女生' : '男生';
    const shotType = character?.shotType === 'half' ? '半身像' : '全身像';
    const shotTypeDetails = character?.shotType === 'half' ? '，特写角色上半身胸像，腰部以上，不露出下半身' : '';
    const expression = config.expression || DATA.expressions.find(item => item.id === 'natural');
    const defaultMakeupId = config.gender === 'male' ? 'nomakeup' : 'nude';
    const makeup = config.makeup || DATA.makeup.find(item => item.id === defaultMakeupId);
    const camera = config.camera || DATA.camera.find(item => item.id === 'eye');
    const defaultPoseImg = DATA.poseImages.normal[2];
    const effectivePoseImg = config.poseImgUrl || defaultPoseImg;
    const outfitDetails = config.outfitPromptText.trim() || '按服饰参考图提取版型、颜色、材质、纹理与搭配关系';
    const propDetails = config.propPromptText.trim() || '按道具参考图提取外观、材质、颜色与握持关系';
    const poseDetails = config.posePromptText.trim() || '保持商业新品营销画面的自然、舒展与高级感';

    const mainParts = [
      `完全参考图1的角色特征，发型特征，这是一个${genderName}的${shotType}${shotTypeDetails}。`,
      `角色身穿图2的服饰，服饰特征为：${outfitDetails}。`,
      `姿势摆成参考图3的姿势，严格参考图3的动作和拍摄角度，对动作的微调为：${poseDetails}。`,
      `角色的面部特征为${expression.label}（${expression.prompt}）。`,
      `妆容为${makeup.label}（${makeup.prompt}）。`,
      `摄像机机位为：${camera.label}，${camera.prompt}。`,
      '专业棚拍布光，柔和且均匀的正面主平光，面部光线干净无强烈阴影，浅灰色背景，整体明亮通透，背景带有淡淡的人物自然投影，高质量商业打光，服装材质纹理清晰，高对比鲜明色调，色彩干净明快，中长焦镜头，极高分辨率，8K画质，超精细细节，锐利对焦，照片级真实感，不要有AI感和塑料感，固定画面为竖版2:3比例。'
    ];

    if (config.propImg) {
      mainParts.splice(3, 0, `手拿或者穿戴图4的道具，${propDetails}。`);
    }

    const main = mainParts.join(' ');

    const chain = [
      { id: 'model', label: '模特参考', img: character?.refImg, desc: character ? `${genderName} / ${shotType}` : '暂未配置' },
      { id: 'outfit', label: '服饰参考', img: config.outfitImg, desc: config.outfitImg ? '版型 / 材质 / 颜色' : '暂未配置' },
      { id: 'pose', label: '动作姿势', img: effectivePoseImg, desc: config.poseImgUrl ? '动作 / 角度 / 重心' : '默认：常规姿势 Slot 3' },
      { id: 'prop', label: '道具参考', img: config.propImg, desc: config.propImg ? '道具 / 握持 / 摆放' : '暂未配置' },
    ].map(item => ({ ...item, hasData: isImageUrl(item.img) }));

    return { main, chain };

  }, [config]);

  return (
    <div className="min-h-screen bg-[#0a0a0c] pb-28 font-sans text-zinc-300">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { height: 8px; width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #111217; border-radius: 999px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 999px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #06b6d4; }
        .loading-dot { animation: loading-dot 1s infinite ease-in-out; }
        .loading-dot:nth-child(2) { animation-delay: 0.14s; }
        .loading-dot:nth-child(3) { animation-delay: 0.28s; }
        @keyframes loading-dot {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
          40% { transform: translateY(-8px); opacity: 1; }
        }
      `}</style>

      <header className="border-b border-zinc-900 bg-[#101116] py-5 text-center">
        <h1 className="text-2xl font-black tracking-tight text-cyan-400">AI Virtual Director</h1>
        <p className="mt-1 text-xs uppercase tracking-[0.28em] text-zinc-500">Commercial KV Configuration Studio</p>
      </header>

      <main className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-8">
        <SectionCard step="1" title="角色设定 (Character)">
          <div className="mb-5 flex items-center gap-3">
            <span className="text-sm font-semibold text-zinc-400">基础性别:</span>
            {[
              ['female', '女模特 (Female)'],
              ['male', '男模特 (Male)'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setGender(id)}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition ${config.gender === id ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'}`}
              >
                <CheckDot active={config.gender === id} />
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            {DATA.models[config.gender].map(model => (
              <div key={model.id} className="rounded-xl border border-zinc-800 bg-zinc-950/30 p-3">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['full', model.fullImg, '全身'],
                    ['half', model.halfImg, '半身'],
                  ].map(([shotType, img, label]) => {
                    const active = config.model?.id === model.id && config.model?.shotType === shotType;
                    return (
                      <button
                        key={shotType}
                        type="button"
                        onClick={() => updateConfig('model', { ...model, shotType, refImg: img })}
                        className={`group overflow-hidden rounded-lg border bg-zinc-950 ${active ? 'border-cyan-400' : 'border-zinc-800 hover:border-zinc-600'}`}
                      >
                        <img src={img} alt={`${model.name}-${label}`} className="aspect-[2/3] w-full object-cover" />
                        <div className="flex items-center justify-center gap-1.5 py-2 text-xs text-zinc-400">
                          <CheckDot active={active} />
                          {label}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3">
                  <div className="font-bold text-zinc-200">{model.name}</div>
                  <div className="text-xs text-zinc-500">{model.desc}</div>
                </div>
              </div>
            ))}

            <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/30 p-3">
              <UploadTile
                label="上传自定义角色"
                value={config.customModel?.refImg}
                onUpload={uploadCustomModel}
                onClear={() => updateConfig('customModel', null)}
              />
              {config.customModel && (
                <div className="mt-3 truncate text-xs text-zinc-500">
                  {config.gender === 'female' ? '女模特' : '男模特'} / 全身像 / {config.customModel.fileName}
                </div>
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard step="2" title="姿势与镜头 (默认站立姿态)">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="text-sm font-semibold text-zinc-400">动作特征大类（可展开子图库）</div>
            <button
              type="button"
              onClick={() => setPosePanelOpen(open => !open)}
              className="rounded-md border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm font-semibold text-zinc-400 transition hover:border-cyan-500 hover:text-cyan-300"
            >
              {posePanelOpen ? '收起姿势与镜头' : '展开姿势与镜头'}
            </button>
          </div>

          {posePanelOpen && (
            <>
              <div className="mb-4 flex flex-wrap gap-3">
                {DATA.poseCategories.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setConfig(prev => ({ ...prev, poseCat: cat.id, poseId: null, poseImgUrl: '' }))}
                    className={`rounded-md border px-4 py-2 text-sm transition ${config.poseCat === cat.id ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'}`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="mb-6 rounded-xl border border-zinc-800/70 bg-zinc-950/30 p-5">
                <div className="mb-4 flex items-center gap-3">
                  <span className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-500">
                    [{config.poseCat}] Reference Slots
                  </span>
                  <span className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-400">悬停 1 秒放大预览</span>
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-8">
                  {Array.from({ length: 20 }).map((_, index) => {
                    const img = (DATA.poseImages[config.poseCat] || [])[index];
                    const id = `${config.poseCat}-${index}`;
                    const active = config.poseId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={!img}
                        onClick={() => img && setConfig(prev => ({ ...prev, poseId: id, poseImgUrl: img }))}
                        className={`relative aspect-[2/3] overflow-hidden rounded-lg border bg-[#15161b] transition ${active ? 'border-cyan-400 ring-2 ring-cyan-500/40' : img ? 'border-zinc-700 hover:border-cyan-500' : 'border-zinc-800 opacity-65'}`}
                      >
                        <span className="absolute right-1.5 top-1.5 z-10 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-zinc-300">
                          Slot {index + 1}
                        </span>
                        {img ? (
                          <img
                            src={img}
                            alt={`pose-${index + 1}`}
                            onMouseEnter={event => openHoverPreview(img, event)}
                            onMouseLeave={closeHoverPreview}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center font-mono text-xs text-zinc-700">Slot {index + 1}</span>
                        )}
                      </button>
                    );
                  })}

                  <label className="flex aspect-[2/3] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-[#15161b] text-zinc-500 transition hover:border-cyan-500 hover:text-cyan-300">
                    <span className="text-2xl font-light">+</span>
                    <span className="mt-2 text-xs font-semibold">新增 Slot</span>
                    <input type="file" accept="image/*" className="hidden" onChange={uploadCustomPose} />
                  </label>
                </div>
              </div>

              <label className="block text-sm font-semibold text-zinc-400">
                动作微调提示词
                <input
                  value={config.posePromptText}
                  onChange={event => updateConfig('posePromptText', event.target.value)}
                  className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-200 outline-none focus:border-cyan-500"
                  placeholder="例如：肩膀放松，身体轻微转向镜头，动作自然不僵硬..."
                />
              </label>

              <div className="mt-6">
                <div className="mb-3 text-sm font-semibold text-zinc-400">摄像机机位（不选默认平拍）</div>
                <div className="flex flex-wrap gap-2">
                  {DATA.camera.map(camera => (
                    <button
                      key={camera.id}
                      type="button"
                      onClick={() => updateConfig('camera', config.camera?.id === camera.id ? null : camera)}
                      className={`rounded-md border px-4 py-2 text-sm transition ${config.camera?.id === camera.id ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'}`}
                    >
                      {camera.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </SectionCard>

        <SectionCard step="3" title="服饰与道具 (Styling & Props)">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <UploadTile
              label="上传服饰参考图 (Garment)"
              value={config.outfitImg}
              onUpload={event => uploadImage('outfitImg', event)}
              onClear={() => updateConfig('outfitImg', '')}
              tall
            />
            <UploadTile
              label="上传道具参考图 (Props)"
              value={config.propImg}
              onUpload={event => uploadImage('propImg', event)}
              onClear={() => updateConfig('propImg', '')}
              tall
            />
          </div>
          <div className="mt-6 space-y-4">
            <label className="block text-sm font-semibold text-zinc-400">
              服饰提示词补充
              <input
                value={config.outfitPromptText}
                onChange={event => updateConfig('outfitPromptText', event.target.value)}
                className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-200 outline-none focus:border-cyan-500"
                placeholder="例如：白色无袖连衣裙、棉麻质感、极简廓形..."
              />
            </label>
            <label className="block text-sm font-semibold text-zinc-400">
              道具提示词补充
              <input
                value={config.propPromptText}
                onChange={event => updateConfig('propPromptText', event.target.value)}
                className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-200 outline-none focus:border-cyan-500"
                placeholder="例如：左手拿咖啡，头部戴上墨镜。"
              />
            </label>
          </div>
        </SectionCard>

        <SectionCard step="4" title="面部特征 (Expression & Makeup)">
          <div className="mb-4 flex items-end justify-between">
            <h3 className="text-sm font-semibold text-zinc-400">表情状态（不选默认自然微笑）</h3>
            <span className="text-xs text-zinc-500">悬停 1 秒放大预览</span>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-8 custom-scrollbar">
            {DATA.expressions.map(item => (
              <FaceOption
                key={item.id}
                item={item}
                active={config.expression?.id === item.id}
                color="cyan"
                onClick={() => updateConfig('expression', config.expression?.id === item.id ? null : item)}
                onPreview={openHoverPreview}
                onLeave={closeHoverPreview}
              />
            ))}
          </div>

          <div className="my-8 border-t border-zinc-800/70" />

          <div className="mb-4 flex items-end justify-between">
            <h3 className="text-sm font-semibold text-zinc-400">妆容设定（不选默认自然裸妆）</h3>
            <span className="text-xs text-zinc-500">悬停 1 秒放大预览</span>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-8 custom-scrollbar">
            {DATA.makeup.map(item => {
              const disabled = !isMakeupAllowed(config.gender, item.id);
              return (
                <FaceOption
                  key={item.id}
                  item={item}
                  active={config.makeup?.id === item.id}
                  color="indigo"
                  disabled={disabled}
                  onClick={() => !disabled && updateConfig('makeup', config.makeup?.id === item.id ? null : item)}
                  onPreview={openHoverPreview}
                  onLeave={closeHoverPreview}
                />
              );
            })}
          </div>
        </SectionCard>

        <div className="mt-12 mb-6 flex items-center justify-between border-b border-zinc-800 pb-4">
          <h2 className="text-xl font-bold text-zinc-200">最终视觉资产列阵 (Output)</h2>
          <button
            type="button"
            onClick={clearConfig}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-6 py-2.5 text-sm font-bold text-zinc-300 shadow-lg transition hover:border-red-500/70 hover:text-red-300"
          >
            清空配置
          </button>
        </div>

        <div className="rounded-xl border border-zinc-800/70 bg-[#13151a] p-6">
          <h3 className="mb-5 font-mono text-sm uppercase tracking-wider text-cyan-500">Reference Input Chain (按顺序解析垫图)</h3>
          <div className="flex items-center gap-4 overflow-x-auto pb-8 custom-scrollbar">
            {promptData.chain.map((ref, index) => (
              <React.Fragment key={ref.id}>
                <div className={`relative flex min-w-[190px] flex-col items-center gap-3 rounded-xl border p-4 ${ref.hasData ? 'border-zinc-700 bg-zinc-900/70' : 'border-dashed border-zinc-800 opacity-60'}`}>
                  <span className={`absolute -left-3 -top-3 flex h-7 w-7 items-center justify-center rounded-full border-4 border-[#13151a] text-sm font-black ${ref.hasData ? 'bg-cyan-500 text-black' : 'bg-zinc-800 text-zinc-500'}`}>
                    {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => ref.hasData && setZoom({ img: ref.img, level: 1 })}
                    className={`flex h-40 w-28 items-center justify-center overflow-hidden rounded-lg border bg-zinc-950 ${ref.hasData ? 'cursor-pointer border-zinc-700 hover:ring-2 hover:ring-cyan-500' : 'border-zinc-800'}`}
                  >
                    {ref.hasData ? <img src={ref.img} alt={ref.label} className="h-full w-full object-cover" /> : <span className="text-3xl font-light text-zinc-700">+</span>}
                  </button>
                  {ref.hasData && (
                    <button
                      type="button"
                      onClick={() => downloadImage(ref.img, `reference-${index + 1}-${ref.id}`)}
                      className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:border-cyan-500 hover:text-cyan-300"
                    >
                      下载参考图
                    </button>
                  )}
                  <div className="w-full text-center">
                    <div className="truncate text-sm font-semibold text-zinc-200">{ref.label}</div>
                    <div className="mt-1 truncate text-xs text-zinc-500">{ref.desc}</div>
                  </div>
                </div>
                {index < promptData.chain.length - 1 && <span className="text-zinc-700">→</span>}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-zinc-800/70 bg-[#13151a]">
          <div className="flex items-center justify-between border-b border-zinc-800/70 px-6 py-4">
            <span className="text-sm font-semibold text-zinc-300">Final Output Prompt (最终输出组合提示词)</span>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(promptData.main)}
              className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:border-cyan-500 hover:text-cyan-300"
            >
              Copy Prompt
            </button>
          </div>
          <div className="whitespace-pre-wrap p-6 font-mono text-sm leading-7 text-zinc-300">{promptData.main}</div>
        </div>

        <div className="mt-10 flex flex-col items-center gap-3">
          <div className="grid w-full max-w-md grid-cols-1 gap-4 sm:grid-cols-2">
            <button
              type="button"
              disabled={isGenerating}
              onClick={handleGenerate}
              className={`rounded-full px-8 py-4 text-base font-black text-white shadow-xl transition ${isGenerating ? 'cursor-not-allowed bg-zinc-700 text-zinc-400 shadow-none' : 'bg-gradient-to-r from-cyan-500 to-indigo-500 shadow-cyan-900/40 hover:scale-[1.02]'}`}
            >
              {isGenerating ? '生图中...' : '立即生图'}
            </button>
          <button
            type="button"
            onClick={() => {
              window.open(workflowUrl, '_blank', 'noopener,noreferrer');
            }}
              className="rounded-full border border-zinc-700 bg-zinc-900 px-8 py-4 text-base font-black text-zinc-300 transition hover:border-cyan-500 hover:text-cyan-300"
          >
              跳转工作流
          </button>
          </div>
          {(generationStatus || generationError) && (
            <div className={`text-sm ${generationError ? 'text-red-400' : 'text-cyan-300'}`}>
              {generationError || generationStatus}
            </div>
          )}
        </div>

        <div className="mx-auto mt-10 grid w-full grid-cols-1 gap-10 md:grid-cols-3 xl:gap-12">
          {[0, 1, 2].map(index => {
            const img = generatedImages[index];
            return (
            <div key={index} className="relative flex aspect-[2/3] w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-zinc-800/80 bg-[#0f1115] text-zinc-600 shadow-2xl">
              {img ? (
                <>
                  <button
                    type="button"
                    onClick={() => setZoom({ img, level: 1 })}
                    className="h-full w-full"
                  >
                    <img src={img} alt={`CANVAS 0${index + 1}`} className="h-full w-full object-cover" />
                  </button>
                  {isGenerating && (
                    <div className="absolute inset-x-0 top-0 flex items-center justify-center gap-2 bg-black/55 py-3 text-xs font-bold text-cyan-300 backdrop-blur">
                      <span>正在生成</span>
                      <span className="loading-dot h-1.5 w-1.5 rounded-full bg-cyan-300" />
                      <span className="loading-dot h-1.5 w-1.5 rounded-full bg-cyan-300" />
                      <span className="loading-dot h-1.5 w-1.5 rounded-full bg-cyan-300" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => downloadImage(img, `canvas-0${index + 1}`)}
                    className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-zinc-700 bg-black/75 px-4 py-2 text-xs font-bold text-zinc-200 backdrop-blur hover:border-cyan-500 hover:text-cyan-300"
                  >
                    下载图片
                  </button>
                </>
              ) : isGenerating ? (
                <>
                  <div className="mb-5 flex h-10 items-center gap-2">
                    <span className="loading-dot h-3 w-3 rounded-full bg-cyan-400" />
                    <span className="loading-dot h-3 w-3 rounded-full bg-cyan-400" />
                    <span className="loading-dot h-3 w-3 rounded-full bg-cyan-400" />
                  </div>
                  <span className="font-mono text-xs tracking-widest text-cyan-500">CANVAS 0{index + 1}</span>
                  <span className="mt-2 text-xs text-zinc-500">正在生成</span>
                </>
              ) : (
                <>
                  <span className="mb-2 text-3xl">▧</span>
                  <span className="font-mono text-xs tracking-widest">CANVAS 0{index + 1}</span>
                  <span className="mt-1 text-xs">AI output preview area</span>
                </>
              )}
            </div>
          );})}
        </div>
      </main>

      {generationError && !isGenerating && (
        <div className="fixed left-1/2 top-6 z-[999997] -translate-x-1/2 rounded-full border border-red-500/40 bg-red-950/90 px-5 py-3 text-sm font-bold text-red-100 shadow-2xl shadow-red-950/40 backdrop-blur">
          {generationError}
        </div>
      )}

      {hoverPreview && (
        <div
          className="fixed pointer-events-none overflow-hidden rounded-2xl border border-cyan-400/50 bg-black shadow-2xl shadow-cyan-950/60"
          style={{ left: hoverPreview.x, top: hoverPreview.y, width: 520, zIndex: 999999 }}
        >
          <img src={hoverPreview.img} alt="hover preview" className="w-full object-cover" />
        </div>
      )}

      {zoom && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/90 p-8" style={{ zIndex: 999998 }} onClick={() => setZoom(null)}>
          <img
            src={zoom.img}
            alt="preview"
            onClick={event => {
              event.stopPropagation();
              setZoom(prev => ({ ...prev, level: prev.level === 1 ? 1.5 : prev.level === 1.5 ? 2 : 1 }));
            }}
            className="max-h-full max-w-full cursor-zoom-in object-contain transition-transform"
            style={{ transform: `scale(${zoom.level})` }}
          />
        </div>
      )}
    </div>
  );
}
