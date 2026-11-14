// Routes authorized account profile edits through the shared account update service.

import { updateAccount } from '../../../admin/accounts/updateAccount.js';
import { requirePermission } from '../../../middleware/rbac.js';

export function registerAccountProfileUpdates(router) {
  router.put('/users/:id', requirePermission('USERS_MANAGE'), async (req, res) => {
    const { first_name, last_name, email } = req.body ?? {};
    if (!first_name || !last_name || !email) {
      return res.status(400).json({ error: 'First name, last name, and email are required.' });
    }

    try {
      await updateAccount(Number(req.params.id), req.body, { actorId: req.user.user_id, ipAddress: req.ip });
      res.json({ message: `Account for ${first_name} ${last_name} updated successfully.` });
    } catch (error) {
      console.error('[Admin Profile Update Error]:', error.code || error.name);
      res.status(error.status || 400).json({ error: error.message || 'Failed to update user profile.' });
    }
  });
}
