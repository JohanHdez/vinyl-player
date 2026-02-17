module.exports = {
  "/ytapi": {
    target: "https://www.youtube.com",
    secure: true,
    changeOrigin: true,
    pathRewrite: { "^/ytapi": "" },
    onProxyReq: (proxyReq) => {
      proxyReq.removeHeader("origin");
      proxyReq.removeHeader("referer");
      proxyReq.setHeader("referer", "https://www.youtube.com/");
      proxyReq.setHeader("origin", "https://www.youtube.com");
    },
  },
};
