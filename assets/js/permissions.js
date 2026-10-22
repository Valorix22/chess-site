(function(){
 'use strict';
 window.GambitPermissions={
  get isAdmin(){return !!window.GambitSession.user?.admin;},
  get isModerator(){return !!window.GambitSession.user?.admin;},
  can(action){const u=window.GambitSession.user;if(!u)return false;if(['admin.roles','admin.settings','admin.games.void'].includes(action))return !!u.owner;return action.startsWith('admin.')?!!u.admin:true;}
 };
})();
