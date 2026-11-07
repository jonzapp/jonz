// Cloudflare Turnstile, the bot check on the email form. Supabase checks the
// token on sign-in, making an account and a forgotten password once Provision
// has turned it on (scripts/provision/lib.mjs's authSettings, with the
// TURNSTILE_SECRET Actions secret). The site key is public: it goes in the page.

/** Jonz's widget, for jonz.app (and the phone apps, which load it as jonz.app). */
export const TURNSTILE_SITE_KEY = '0x4AAAAAAF3vzdZSg9iEAd8G';

/** Cloudflare's test key: always passes, on any address. Staging, previews and local Supabase don't check tokens. */
export const TURNSTILE_TEST_KEY = '1x00000000000000000000AA';

/** Where the phone apps' check says it is, so the widget's hostname matches. */
export const TURNSTILE_HOME = 'https://jonz.app/';

export const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** The real key on jonz.app (or a phone, `host` null); the test key anywhere else. */
export function turnstileKey(host: string | null): string {
  return host === null || host === 'jonz.app' ? TURNSTILE_SITE_KEY : TURNSTILE_TEST_KEY;
}

/**
 * The page a phone's web view loads: the widget, shown only if Cloudflare
 * needs a tap ("interaction-only"), posting each message to the app as JSON:
 * `{ token }` (null when it lapses or fails) and `{ show }` while it wants a tap.
 */
export function turnstilePage(siteKey: string, theme: 'light' | 'dark'): string {
  const options = JSON.stringify({ sitekey: siteKey, theme, appearance: 'interaction-only' });
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;background:transparent}</style>
<script src="${TURNSTILE_SCRIPT}"></script></head><body><div id="check"></div><script>
function send(m){window.ReactNativeWebView.postMessage(JSON.stringify(m))}
function start(){
  var o=${options};
  o.callback=function(t){send({token:t})};
  o['expired-callback']=function(){send({token:null})};
  o['error-callback']=function(){send({token:null})};
  o['before-interactive-callback']=function(){send({show:true})};
  o['after-interactive-callback']=function(){send({show:false})};
  window.check=turnstile.render('#check',o);
}
window.resetCheck=function(){send({token:null});turnstile.reset(window.check)};
(function wait(){window.turnstile?start():setTimeout(wait,50)})();
</script></body></html>`;
}
