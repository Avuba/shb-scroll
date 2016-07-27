// use ES2015 in webpack config: http://stackoverflow.com/questions/31903692/how-to-use-es6-in-webpack-config
import webpack from 'webpack';
import yargs from 'yargs';


let UglifyJsPlugin = webpack.optimize.UglifyJsPlugin,
  shellArgs = yargs.argv,
  outputPath = './dev',
  plugins = [];


// DEV
if (shellArgs.mode === 'dev') {
  outputPath = './dev';
}


// BUILD
if (shellArgs.mode === 'build') {
  outputPath = './dist';
  if (shellArgs.minify !== 'false') shellArgs.minify = true;
}


if (shellArgs.minify === 'true' || shellArgs.minify === true) {
  plugins.push(new UglifyJsPlugin({
    compress: {
      warnings: false,
    },
    output: {
      comments: false,
    }
  }));
}


module.exports = {
  entry: './src/Mustafas.js',
  output: {
    path: outputPath,
    filename: 'Mustafas.js',
    // helps exposing library to the window object while still matching AMD /
    // commonJS / etc. requirements: https://github.com/umdjs/umd
    library: 'Mustafas',
    libraryTarget: 'umd',
    umdNamedDefine: true
  },
  module: {
    loaders: [{
      test: /\.js$/,
      exclude: /node_modules/,
      loader: 'babel-loader',
    }]
  },
  plugins: plugins,
  devServer: {
    contentBase: "./dev",
  }
};
