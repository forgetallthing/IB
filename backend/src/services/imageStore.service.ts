import mongoose from 'mongoose';

// 图片统一存入 MongoDB GridFS（bucket 名 images），
// 大文件按 255KB 分块存储，不受 BSON 16MB 文档上限约束。
const BUCKET_NAME = 'images';

interface StoredImage {
  id: string;
  length: number;
}

interface ImageStream {
  stream: NodeJS.ReadableStream;
  contentType: string;
  length: number;
}

function getBucket(): mongoose.mongo.GridFSBucket {
  const db = mongoose.connection.db;
  if (!db) throw new Error('数据库尚未连接');
  return new mongoose.mongo.GridFSBucket(db, { bucketName: BUCKET_NAME });
}

export function saveImage(data: Buffer, filename: string, contentType: string): Promise<StoredImage> {
  return new Promise((resolve, reject) => {
    const uploadStream = getBucket().openUploadStream(filename, {
      contentType,
      metadata: { contentType, filename },
    });
    uploadStream.on('error', reject);
    uploadStream.on('finish', () => {
      resolve({ id: String(uploadStream.id), length: uploadStream.length });
    });
    uploadStream.end(data);
  });
}

export async function getImage(id: string): Promise<ImageStream | null> {
  const bucket = getBucket();
  const fileId = new mongoose.Types.ObjectId(id);
  const files = await bucket.find({ _id: fileId }).toArray();
  if (files.length === 0) return null;

  const file = files[0] as {
    length: number;
    contentType?: string;
    metadata?: { contentType?: string };
  };
  const contentType = file.metadata?.contentType ?? file.contentType ?? 'application/octet-stream';

  return {
    stream: bucket.openDownloadStream(fileId),
    contentType,
    length: file.length,
  };
}