const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const ManifestPlugin = require("webpack-extension-manifest-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin"); // <-- Import the plugin
const baseManifest = require("./src/manifest.json");

module.exports = (env, argv) => {
  const isProduction = argv.mode === "production";

  return {
    entry: {
    background: "./src/scripts/background/index.js",
    engagementWorker: "./src/scripts/background/engagementWorker.js",
    content: "./src/scripts/content/index.js",
    activityEnageger: "./src/scripts/activityEngager/index.js",
    import: "./src/scripts/import/index.js",
    linkedinNoResultsObserver: "./src/scripts/content/linkedinNoResultsObserver.js",
    popup: "./src/scripts/popup/index.js",
    options: [
      "./src/scripts/options/index.js",
      "./src/scripts/history/index.js",
    ],
    analytics: "./src/scripts/options/analytics.js", // <- NEW SEPARATE ENTRY
    testComment: "./src/scripts/content/testComment.js",
    importProspect: "./src/scripts/content/importProspect.js",
    topicList: "./src/scripts/content/topicList.js",
  },
    output: {
      filename: "js/[name].js",
      path: path.resolve(__dirname, "dist"),
      publicPath: "",
      // Add clean: true here if not using CleanWebpackPlugin or prefer this method
      // clean: true,
    },
    resolve: {
      alias: {
        "@utils": path.resolve(__dirname, "src/scripts/utils"),
      },
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: "babel-loader",
          },
        },
        {
          test: /\.css$/,
          use: [
            // Replace 'style-loader' with MiniCssExtractPlugin.loader
            isProduction ? MiniCssExtractPlugin.loader : "style-loader", // Use style-loader for dev HMR
            {
              loader: "css-loader",
              options: {
                url: false, // Keep this if you don't want css-loader handling url()
              },
            },
            {
              loader: "postcss-loader",
              options: {
                postcssOptions: {
                  plugins: [
                    require("tailwindcss")("./tailwind.config.js"),
                    require("autoprefixer"),
                  ],
                },
              },
            },
          ],
        },
        {
          test: /\.(png|svg|jpg|jpeg|gif)$/i,
          type: "asset/resource",
          generator: {
            filename: "assets/[name][ext][query]",
          },
        },
      ],
    },
    plugins: [
      new CleanWebpackPlugin(), // Keep or remove based on preference vs output.clean
      new ManifestPlugin({
        config: {
          base: baseManifest,
          extend: {
            version: process.env.npm_package_version,
          },
        },
      }),
      new HtmlWebpackPlugin({
        template: "./src/html/popup.html",
        filename: "popup.html",
        chunks: ["popup", "commons", "runtime~popup"], // Include runtime chunk if generated
      }),
      new HtmlWebpackPlugin({
        template: "./src/html/options.html",
        filename: "options.html",
        chunks: ["options", "analytics", "commons", "runtime~options"],
      }),

      new CopyWebpackPlugin({
        patterns: [
          { from: "src/assets", to: "assets" },
          {
            from: "src/styles",
            to: "styles",
            globOptions: {
              ignore: ["**/*.scss", "**/*.sass"],
            },
            noErrorOnMissing: true,
          },
          { from: "src/selectors.json", to: "." },
        ],
      }),
      // Add the MiniCssExtractPlugin to the plugins array
      new MiniCssExtractPlugin({
        filename: "css/[name].[contenthash].css", // Output CSS files to a css folder
        chunkFilename: "css/[id].[contenthash].css",
      }),
    ],
    optimization: {
      splitChunks: {
        cacheGroups: {
          default: false,
          vendors: false,
          commons: {
            name: "commons",
            chunks: (chunk) =>
              ["popup", "options", "analytics"].includes(chunk.name),
            minChunks: 2,
            minSize: 0,
          },
        },
      },
      runtimeChunk: {
        name: (entrypoint) =>
          ["popup", "options", "analytics"].includes(entrypoint.name)
            ? `runtime~${entrypoint.name}`
            : undefined,
      },
      minimize: isProduction,
      // Add minimizer for CSS in production
      minimizer: [
        // For webpack@5 you can use the `...` syntax to extend existing minimizers (like TerserPlugin)
        `...`,
        // Conditionally add CssMinimizerPlugin in production
        ...(isProduction
          ? [new (require("css-minimizer-webpack-plugin"))()]
          : []),
      ],
    },
    devtool: isProduction ? false : "cheap-module-source-map",
  };
};
