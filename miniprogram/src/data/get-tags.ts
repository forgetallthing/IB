import { mockTags } from './db';

export default function getTags() {
  return [...mockTags].sort((a, b) => a.displayOrder - b.displayOrder);
}
