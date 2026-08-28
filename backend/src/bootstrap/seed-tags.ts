import { TagModel } from '../models/tag.model.js';

const defaultTags = [
  { name: '基础', color: '#efe8dd', description: '通用基础笔记', displayOrder: 1 },
  { name: '前端', color: '#e7f0ff', description: '前端相关笔记', displayOrder: 2 },
  { name: '后端', color: '#e9f7ef', description: '后端相关笔记', displayOrder: 3 },
];

export async function seedDefaultTags() {
  for (const tag of defaultTags) {
    const exists = await TagModel.findOne({ name: tag.name }).exec();
    if (!exists) {
      await TagModel.create({ ...tag, active: true });
    }
  }
}
