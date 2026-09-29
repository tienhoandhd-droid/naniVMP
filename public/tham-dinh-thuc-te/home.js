(() => {
  'use strict';
  const target=new URL('./runs.html',location.href);
  if(window.CPC1Embedded)window.CPC1Embedded.navigate(target.href);
  else location.replace(target.href);
})();
