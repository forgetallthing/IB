import { Schema, model, type InferSchemaType } from 'mongoose';

const questionSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    answer: { type: String, default: '' },
    tags: { type: [String], default: [] },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], required: true, default: 'medium' },
    creatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    creatorName: { type: String, required: true },
    visibility: { type: String, enum: ['public', 'private'], required: true, default: 'public' },
    source: { type: String },
    aiSummary: { type: String },
    aiSuggestedTags: { type: [String], default: [] },
    aiSuggestedDifficulty: { type: String, enum: ['easy', 'medium', 'hard'] },
  },
  { timestamps: true },
);

export type QuestionDocument = InferSchemaType<typeof questionSchema>;
export const QuestionModel = model('Question', questionSchema);
