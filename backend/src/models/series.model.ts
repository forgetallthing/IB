import { Schema, model, type InferSchemaType } from 'mongoose';

// 系列笔记：创建者私有域，成员关系挂在笔记上（Question.seriesId + Question.order），
// 一篇笔记最多属于一个系列；删除系列 = 解绑成员文章而非删除文章。
const seriesSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    creatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    creatorName: { type: String, required: true },
    // 目录排序：同级别拖拽调整顺序用，数字越小越靠前
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export type SeriesDocument = InferSchemaType<typeof seriesSchema>;
export const SeriesModel = model('Series', seriesSchema);
