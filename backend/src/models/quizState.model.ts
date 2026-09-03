import { Schema, model, type InferSchemaType } from 'mongoose';

// 每日回想权重状态：按 用户 × 笔记 维度记录出现次数与完全掌握标记
const quizStateSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    questionId: { type: Schema.Types.ObjectId, required: true },
    // 被抽中（展示）的次数：次数越多权重越低；自评反馈也会调整此值
    drawCount: { type: Number, default: 0, min: 0 },
    lastDrawAt: { type: Date },
    // 完全掌握：仅通过回想自评反馈设置，设置后不再推送
    mastered: { type: Boolean, default: false },
  },
  { timestamps: true },
);

quizStateSchema.index({ userId: 1, questionId: 1 }, { unique: true });

export type QuizStateDocument = InferSchemaType<typeof quizStateSchema>;
export const QuizStateModel = model('QuizState', quizStateSchema);

// 回想权重：按出现次数映射的抽取权重；完全掌握（mastered）不在此列，直接排除
export const QUIZ_LEVEL_WEIGHTS: { [level: number]: number } = { 0: 0, 1: 8, 2: 25, 3: 50, 4: 100 };
export const levelWeight = (level: number) => QUIZ_LEVEL_WEIGHTS[level] ?? 0;

// 按出现次数的自动档位：0 次=优先推荐，1-2 次=常规复习，3-5 次=继续巩固，6+ 次=低频回顾
export const autoLevelByDrawCount = (drawCount: number) => {
  if (drawCount <= 0) return 4;
  if (drawCount <= 2) return 3;
  if (drawCount <= 5) return 2;
  return 1;
};
