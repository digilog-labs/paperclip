/** Env for Cloudtype / low-RAM CI UI builds (import from other scripts). */
export const cloudtypeBuildEnv = {
  ...process.env,
  NODE_ENV: "development",
  npm_config_production: "false",
  CLOUDTYPE_BUILD: "1",
  NODE_OPTIONS: process.env.NODE_OPTIONS ?? "--max-old-space-size=1536",
};
