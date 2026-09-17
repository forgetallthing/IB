import { Schema, model, type InferSchemaType } from 'mongoose';

// 笔记历史版本：整篇快照，独立集合避免主文档膨胀。
// 只快照内容四字段（标题/正文/标签/难度）——可见性不是内容演化，type 变更会牵动系列归属，均不入版本
const questionVersionSchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, required: true },
    v: { type: Number, required: true, min: 1 },
    title: { type: String, required: true },
    content: { type: String, required: true },
    tags: { type: [String], default: [] },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], required: true, default: 'medium' },
    editorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    editorName: { type: String, required: true },
    // edit=常规保存前捕获的旧内容；restore=恢复旧版前捕获的当时内容
    reason: { type: String, enum: ['edit', 'restore'], required: true, default: 'edit' },
  },
  { timestamps: true },
);

questionVersionSchema.index({ questionId: 1, v: -1 }, { unique: true });

export type QuestionVersionDocument = InferSchemaType<typeof questionVersionSchema>;
export const QuestionVersionModel = model('QuestionVersion', questionVersionSchema);

// 每篇笔记保留的版本上限：写入新版本后裁掉更早的
export const QUESTION_VERSION_KEEP = 30;

// 内容四字段是否一致（用于保存去重与恢复 no-op 判定）
export function questionContentEquals(
  a: { title: string; content: string; tags?: string[]; difficulty: string },
  b: { title: string; content: string; tags?: string[]; difficulty: string },
) {
  return (
    a.title === b.title &&
    a.content === b.content &&
    a.difficulty === b.difficulty &&
    (a.tags ?? []).length === (b.tags ?? []).length &&
    (a.tags ?? []).every((tag, index) => tag === (b.tags ?? [])[index])
  );
}

// 捕获一篇笔记的当前内容为历史版本（v 单调递增，超上限裁剪更早的）。
// 单题仅创建者/管理员可改，无并发写入，v 取 max+1 即可，无需计数器或事务
export async function recordQuestionVersion(
  question: { _id: unknown; title: string; content: string; tags?: string[]; difficulty: 'easy' | 'medium' | 'hard' },
  editor: { sub?: string; username?: string },
  reason: 'edit' | 'restore',
) {
  const last = (await QuestionVersionModel.find({ questionId: question._id })
    .sort({ v: -1 })
    .limit(1)
    .select('v')
    .lean()) as Array<{ v?: number }>;
  const v = (last[0]?.v ?? 0) + 1;
  await QuestionVersionModel.create({
    questionId: question._id,
    v,
    title: question.title,
    content: question.content,
    tags: question.tags ?? [],
    difficulty: question.difficulty,
    editorId: editor.sub,
    editorName: editor.username ?? 'unknown',
    reason,
  });
  if (v > QUESTION_VERSION_KEEP) {
    await QuestionVersionModel.deleteMany({ questionId: question._id, v: { $lte: v - QUESTION_VERSION_KEEP } });
  }
  return v;
}
