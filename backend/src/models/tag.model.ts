import { Schema, model, type InferSchemaType } from 'mongoose';

const tagSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    color: { type: String, default: '#f3eee8' },
    description: { type: String, default: '' },
    active: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export type TagDocument = InferSchemaType<typeof tagSchema>;
export const TagModel = model('Tag', tagSchema);
