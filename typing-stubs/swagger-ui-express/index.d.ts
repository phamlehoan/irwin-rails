declare module 'swagger-ui-express' {
  import express = require('express');

  interface SwaggerUiAssetOptions {
    url?: string;
    urls?: Array<{ url: string; name: string }>;
    swaggerOptions?: any;
    customCss?: string;
    customCssUrl?: string;
    customJs?: string;
    customJsStr?: string;
    customSiteTitle?: string;
    customfavIcon?: string;
    swaggerUrl?: string;
    presets?: any[];
    plugins?: any[];
    layout?: string;
  }

  function serve(options?: SwaggerUiAssetOptions): express.RequestHandler[];
  function setup(definition: object, options?: SwaggerUiAssetOptions): express.RequestHandler;

  export = {
    serve,
    setup,
  };
}
