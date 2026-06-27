/**
 * Process-wide module state set synchronously while building dynamic modules.
 * Currently only tracks whether worker registration is manual.
 */
export const groupMqModuleState: { manualRegistration: boolean } = {
  manualRegistration: false,
};
