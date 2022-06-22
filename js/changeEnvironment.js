(doc => {
  const DOCS_SELECTOR = "#docs";
  const RAW_LINK_SELECTOR  = "#view-raw";
  const ENV_PARAM_KEY = "env";
  const ENV = [
    {
      value: "production",
      selector: "#switch-prod",
      docsURL: "https://raw.githubusercontent.com/wri/fw_exports/production/docs/fw_exports.yaml"
    },
    {
      value: "staging",
      selector: "#switch-staging",
      docsURL: "https://raw.githubusercontent.com/wri/fw_exports/staging/docs/fw_exports.yaml"
    },
    {
      value: "dev",
      selector: "#switch-dev",
      docsURL: "https://raw.githubusercontent.com/wri/fw_exports/dev/docs/fw_exports.yaml"
    }
  ];

  let activeSwitch, viewRawLink;
  const activateSwitch = selector => {
    if (activeSwitch) {
      activeSwitch.classList.remove("active");
    }
    activeSwitch = doc.querySelector(selector);
    activeSwitch.classList.add("active");
  };

  const updateEnvParam = value => {
    let url = new URL(document.location);
    url.searchParams.set(ENV_PARAM_KEY, value);
    window.history.pushState(null, '', url.toString());
  }

  const switchDocs = async env => {
    const docs = doc.querySelector(DOCS_SELECTOR);
    activateSwitch(env.selector);
    docs.apiDescriptionDocument = "";
    docs.apiDescriptionDocument = await fetch(env.docsURL).then(res => res.text());
    viewRawLink.href = env.docsURL;
    updateEnvParam(env.value);
  };

  const init = () => {
    viewRawLink = doc.querySelector(RAW_LINK_SELECTOR);

    ENV.forEach((env) => {
      const switcher = doc.querySelector(env.selector);

      switcher.addEventListener("click", () => {
        switchDocs(env);
      });
    });

    // Find the current Env to load based on the URL param
    // If not found then 'production' is set as the environment
    let params = (new URL(document.location)).searchParams;
    let currentEnv = [...ENV].shift();
    if (params.has(ENV_PARAM_KEY) && ENV.find(env => env.value === params.get(ENV_PARAM_KEY))) {
      currentEnv = ENV.find(env => env.value === params.get(ENV_PARAM_KEY));
    }

    switchDocs(currentEnv);
  };

  doc.addEventListener("DOMContentLoaded", init);
})(document);
