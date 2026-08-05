// CRACO config: relax webpack 5's "fullySpecified" rule so ESM packages
// like `web-ifc-viewer` that omit `.js` extensions in internal imports resolve.
module.exports = {
    webpack: {
        configure: (webpackConfig) => {
            webpackConfig.module.rules.push({
                test: /\.m?js$/,
                resolve: { fullySpecified: false },
            });
            // Silence noisy "Failed to parse source map" warnings from published
            // packages that ship broken source maps (e.g. web-ifc-viewer).
            // Also silence "Critical dependency" warnings from web-ifc's
            // emscripten glue: it contains a Node.js `require()` fallback that
            // is never executed in the browser build.
            webpackConfig.ignoreWarnings = [
                ...(webpackConfig.ignoreWarnings || []),
                /Failed to parse source map/,
                {
                    module: /web-ifc[\\/](web-ifc-api|web-ifc-api-browser)\.js$/,
                    message: /Critical dependency/,
                },
            ];
            return webpackConfig;
        },
    },
};
