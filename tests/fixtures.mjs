export const TEST_INVITE_CODE = 'test-invite-code-1234567890';

export const withTestInviteEnv = (env = process.env) => ({
  ...env,
  INVITE_CODE: TEST_INVITE_CODE,
});

export async function fillTestInvite(page) {
  await page.getByLabel('邀请码').fill(TEST_INVITE_CODE);
}
