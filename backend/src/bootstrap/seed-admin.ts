import { UserModel } from '../models/user.model.js';
import { appConfig } from '../config.js';
import { hashPassword } from '../services/password.service.js';

export async function seedDefaultAdmin() {
  const existing = await UserModel.findOne({ role: 'admin' }).lean();
  if (existing) {
    return existing;
  }

  return UserModel.create({
    username: appConfig.adminSeedUsername,
    email: appConfig.adminSeedEmail,
    passwordHash: hashPassword(appConfig.adminSeedPassword),
    role: 'admin',
    status: 'active',
  });
}
