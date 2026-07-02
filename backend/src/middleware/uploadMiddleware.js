const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { errorResponse } = require("../helpers/responseHelper");
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = path.join(__dirname, "../../uploads");

    const type = req.baseUrl.split("/").pop();
    if (type === "categories") uploadPath = path.join(uploadPath, "categories");
    else if (type === "products") uploadPath = path.join(uploadPath, "products");
    else if (type === "banners") uploadPath = path.join(uploadPath, "banners");
    else if (type === "banner-videos") uploadPath = path.join(uploadPath, "banner-videos");
    else if (type === "media") uploadPath = path.join(uploadPath, "media");
    else if (type === "content") uploadPath = path.join(uploadPath, "content");
    else if (type === "collections") uploadPath = path.join(uploadPath, "collections");
    else if (type === "admins") uploadPath = path.join(uploadPath, "admins");
    else if (type === "auth") uploadPath = path.join(uploadPath, "customers");

    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const imageFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|svg|pdf/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error("Only images (jpeg, jpg, png, gif, webp, svg) and PDF files are allowed"), false);
  }
};

const videoFilter = (req, file, cb) => {
  const allowedTypes = /mp4|webm|mov|avi|mkv|m4v/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = /video\//.test(file.mimetype) || allowedTypes.test(file.mimetype);

  if (extname || mimetype) {
    cb(null, true);
  } else {
    cb(new Error("Only video files (mp4, webm, mov, avi, mkv) are allowed"), false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.UPLOAD_MAX_SIZE) || 10 * 1024 * 1024,
  },
  fileFilter: imageFilter,
});

const videoUpload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.UPLOAD_VIDEO_MAX_SIZE) || 100 * 1024 * 1024,
  },
  fileFilter: videoFilter,
});

const productUpload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.UPLOAD_MAX_SIZE) || 10 * 1024 * 1024,
    files: 60,
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "variant_images" || file.fieldname.startsWith("variant_images")) {
      return imageFilter(req, file, cb);
    }
    return imageFilter(req, file, cb);
  },
});

const uploadErrorHandler = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      const isVideoRoute = req.baseUrl?.includes("banner-videos");
      const maxMb = isVideoRoute
        ? Math.round((parseInt(process.env.UPLOAD_VIDEO_MAX_SIZE, 10) || 100 * 1024 * 1024) / (1024 * 1024))
        : Math.round((parseInt(process.env.UPLOAD_MAX_SIZE, 10) || 10 * 1024 * 1024) / (1024 * 1024));
      return errorResponse(res, `File too large. Maximum size is ${maxMb}MB`, 400);
    }
    return errorResponse(res, err.message, 400);
  }
  if (err) {
    return errorResponse(res, err.message, 400);
  }
  next();
};

module.exports.upload = upload;
module.exports.videoUpload = videoUpload;
module.exports.productUpload = productUpload;
module.exports.uploadErrorHandler = uploadErrorHandler;
