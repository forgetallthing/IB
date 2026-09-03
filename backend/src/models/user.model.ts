import { Schema, model, type InferSchemaType } from 'mongoose';

const userSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, unique: true, sparse: true, trim: true },
    // 微信小程序 openid（微信登录账号唯一标识）
    openId: { type: String, unique: true, sparse: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'member'], required: true },
    status: { type: String, enum: ['active', 'disabled'], required: true, default: 'active' },
    lastLoginAt: { type: Date },
    // 每日回想筛选偏好（空数组 = 不筛选）
    quizPrefs: {
      difficulty: { type: [String], enum: ['easy', 'medium', 'hard'], default: [] },
      tags: { type: [String], default: [] },
    },
  },
  { timestamps: true },
);

export type UserDocument = InferSchemaType<typeof userSchema>;
export const UserModel = model('User', userSchema);
