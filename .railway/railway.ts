import { defineRailway, github, project, service } from "railway/iac";
// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "vinyl-player";
export default defineRailway(() => {
  const vinylPlayer = service("vinyl-player", {
    source: github("JohanHdez/vinyl-player", { branch: "master", checkSuites: false }),
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    healthcheck: "/api/health",
    healthcheckTimeout: 60,
    replicas: { "us-east4-eqdc4a": 1 },
    networking: { privateNetworkEndpoint: "ironfit" },
  });

  return project("alert-acceptance", {
    variables: { managed: false },
    resources: [vinylPlayer],
  });
});
