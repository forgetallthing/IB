import { Schema, model, type InferSchemaType } from 'mongoose';

// 每日回想事件日志：记录每次抽中与自评反馈，供学习统计（打卡日历、薄弱标签）使用
const quizLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    questionId: { type: Schema.Types.ObjectId, required: true },
    action: { type: String, enum: ['draw', 'review'], required: true },
    // 仅 review 事件有值：known=记住了 fuzzy=模糊 forgot=没记住 mastered=完全掌握
    feedback: { type: String, enum: ['known', 'fuzzy', 'forgot', 'mastered'], default: null },
  },
  { timestamps: true },
);

quizLogSchema.index({ userId: 1, createdAt: -1 });
quizLogSchema.index({ userId: 1, action: 1, questionId: 1 });

export type QuizLogDocument = InferSchemaType<typeof quizLogSchema>;
export const QuizLogModel = model('QuizLog', quizLogSchema);
