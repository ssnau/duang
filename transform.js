var babel = require('babel-core');

module.exports = transform;

function transform(code, fn) {
  return babel.transform(code, {
    plugins: [
      replaceRequire
    ]
  }).code;

  function replaceRequire(opt) {
      var Plugin = opt.Plugin;
      return {
        visitor: {
          CallExpression: function CallExpression(path) {
            // require.resolve
            var node = path.node;
            if (node.callee.name === "require" && node.arguments.length === 1) {
              var filepath = node.arguments[0].value;
              if (!filepath) return;
              node.arguments[0].value = fn(filepath);
              return;
            }
            // require.resolve
            var callee = node.callee;
            if (!callee.object) return;
            if (!callee.property) return;
            if (node.arguments.length !== 1) return;
            if (!node.arguments[0].value) return;

            if ( callee.object.name == 'require' && callee.property.name == 'resolve') {
                node.arguments[0].value = fn(node.arguments[0].value);
            }
          }
        }
      };
    }
}
