const path = require('path');
const fs = require('fs');
const multer = require('multer');

const ensureDir = (p) => { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); };

const chatDir = path.join(__dirname, '..', '..', 'uploads', 'chat');
ensureDir(chatDir);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, chatDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const name = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`;
    cb(null, name);
  }
});

const limits = { fileSize: 20 * 1024 * 1024 }; // 20MB
const fileFilter = (_req, file, cb) => {
  const allowed = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf', 'text/plain', 'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'
  ];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Tipo de arquivo não permitido'), false);
};

const upload = multer({ storage, limits, fileFilter });

const uploadChatFile = [
  upload.single('file'),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Arquivo obrigatório' });
    }
    const publicUrl = `${req.protocol}://${req.get('host')}/uploads/chat/${req.file.filename}`;
    return res.json({
      success: true,
      data: {
        url: publicUrl,
        name: req.file.originalname,
        size: req.file.size,
        mime: req.file.mimetype,
        isImage: req.file.mimetype.startsWith('image/')
      }
    });
  }
];

module.exports = { uploadChatFile };
