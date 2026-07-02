module.exports = {
  extends: './.eslintrc.js',
  overrides: [
    {
      files: ['./credentials/**/*.ts', './nodes/**/*.ts'],
      plugins: ['eslint-plugin-n8n-nodes-base'],
      extends: ['plugin:n8n-nodes-base/community'],
    },
  ],
};
