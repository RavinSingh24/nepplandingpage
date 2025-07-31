const environments = {
  development: {
    apiKey: "dev-key",
    // other dev config
  },
  production: {
    apiKey: "AIzaSyACpzHEJBx9xBI0vWijY4BdgYug1CY4DBY",
    // current production config
  }
};

// Updated to detect nepp.org domain
export const currentEnvironment = (
  window.location.hostname === 'nepp.org' || 
  window.location.hostname === 'www.nepp.org'
) ? environments.production : environments.development;