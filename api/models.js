const { json, getAuth, getVideoCatalog, getImageCatalog } = require('./_shared');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  try {
    const { key, mode } = getAuth(req);
    const type = String(req.query.type || 'all');

    if (type === 'video') {
      const models = await getVideoCatalog(key);
      return json(res, 200, { mode, type, models, checkedAt: new Date().toISOString() });
    }

    if (type === 'image') {
      const models = await getImageCatalog(key);
      return json(res, 200, { mode, type, models, checkedAt: new Date().toISOString() });
    }

    const [videoModels, imageModels] = await Promise.all([getVideoCatalog(key), getImageCatalog(key)]);
    return json(res, 200, { mode, type: 'all', videoModels, imageModels, checkedAt: new Date().toISOString() });
  } catch (e) {
    return json(res, e.status || 500, { error: e.message, details: e.details || undefined });
  }
};
