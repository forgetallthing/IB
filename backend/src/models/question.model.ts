import { Schema, model, type InferSchemaType } from 'mongoose';

const questionSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    tags: { type: [String], default: [] },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], required: true, default: 'medium' },
    creatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    creatorName: { type: String, required: true },
    visibility: { type: String, enum: ['public', 'private'], required: true, default: 'public' },
    source: { type: String },
    // 笔记类型：qa = 回想（参与每日回想，默认）；article = 文章（不进回想池，可加入系列）
    type: { type: String, enum: ['qa', 'article'], required: true, default: 'qa' },
    // 系列归属：一篇笔记最多属于一个系列；类型改回 qa 时自动清空（移出系列）
    seriesId: { type: Schema.Types.ObjectId, ref: 'Series' },
    order: { type: Number },
    aiSummary: { type: String },
    aiSuggestedTags: { type: [String], default: [] },
    aiSuggestedDifficulty: { type: String, enum: ['easy', 'medium', 'hard'] },
  },
  { timestamps: true },
);

export type QuestionDocument = InferSchemaType<typeof questionSchema>;
export const QuestionModel = model('Question', questionSchema);
