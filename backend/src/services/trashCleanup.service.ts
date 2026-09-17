import { QuestionModel } from '../models/question.model.js';
import { purgeQuestionsByIds } from './questionPurge.service.js';

// 回收站保留期：进站 30 天后自动彻底删除
const TRASH_RETENTION_DAYS = 30;
// 清理周期：每 24 小时一次（启动时先补跑一次）
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

// 清理超过保留期的回收站笔记，返回清理数量
export async function purgeExpiredTrash(): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const expired = (await QuestionModel.find({ deletedAt: { $ne: null, $lt: cutoff } })
    .select('_id')
    .lean()) as Array<{ _id: unknown }>;
  if (!expired.length) return 0;
  return purgeQuestionsByIds(expired.map((row) => row._id));
}

// 常驻定时清理（pm2 常驻进程场景）：启动先跑一次，之后每 24 小时一次。
// 不用 MongoDB TTL 索引——TTL 是物理删除且无法触发 versions/QuizState 的级联清理
export function startTrashCleanupJob(log: (message: string) => void = console.log) {
  const run = () =>
    purgeExpiredTrash()
      .then((count) => {
        if (count > 0) log(`trash cleanup: purged ${count} expired notes`);
      })
      .catch((err: unknown) => {
        log(`trash cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
      });
  void run();
  const timer = setInterval(run, CLEANUP_INTERVAL_MS);
  timer.unref?.();
  return timer;
}
