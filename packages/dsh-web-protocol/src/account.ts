/**
 * Account Remote + DeepSeek account wire views.
 *
 * The account views live in `dsh-deepseek-account` as of dsh 0.2.2-rc.2; the
 * rc.1 `dsh-api-account-controller` published the same names and has no rc.2
 * release, so re-exporting both would collide. Nothing here is called by the
 * product (`account.*` stays unused), so this module tracks the newer owner.
 */
export type {} from "@deepseek-ai/dsh-deepseek-account/remote";
export type * from "@deepseek-ai/dsh-deepseek-account/types";
