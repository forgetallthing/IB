import { requireMockUser } from './session';

export default function getMe() {
  const user = requireMockUser();
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
  };
}
