import { QuestionModel } from '../models/question.model.js';
import { QuestionVersionModel } from '../models/questionVersion.model.js';
import { QuizStateModel } from '../models/quizState.model.js';

// 彻底删除的级联清理：历史版本 + 回想权重一并移除。
// 回想日志保留（看板热力图/趋势/打卡是历史事实，不塌方）；
// GridFS 图片无需处理——引用扫描 GC 只认现存文档，文档消失即视为无引用，下轮 GC 自然回收
export async function purgeQuestionsByIds(ids: unknown[]): Promise<number> {
  if (!ids.length) return 0;
  await QuestionVersionModel.deleteMany({ questionId: { $in: ids } });
  await QuizStateModel.deleteMany({ questionId: { $in: ids } });
  const result = await QuestionModel.deleteMany({ _id: { $in: ids } });
  return result.deletedCount ?? 0;
}
