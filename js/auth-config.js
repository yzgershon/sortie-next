/* תחקיר — who may open the app.
 *
 * This is the only file to edit to turn the gate on, off, or change who gets in.
 * Leave clientId empty and the gate does not exist: the app opens exactly as it
 * did before. That is deliberate, so a half-finished setup can never lock
 * anybody out of their own flights.
 */
(function (g) {
  'use strict';

  g.AUTH_CONFIG = {

    /* From Google Cloud Console → APIs & Services → Credentials →
       OAuth client ID → Web application. Paste the whole thing, it ends in
       .apps.googleusercontent.com. Empty string = no gate. */
    clientId: '790989398891-df36sea2it2rbupm466ae8tknsg28h31.apps.googleusercontent.com',

    /* Who is allowed in: SHA-256 of the address, lowercase hex. A plain address
       works too, but do not put one here — this repo is public and a course
       roster of personal addresses has no business being readable in it.
         node dev/hash-email.js someone@gmail.com
       An empty list blocks everyone, which is the safe way to fail.

       The comments are first names only, deliberately: enough to find whose
       line to delete, not enough to reconstruct an address. The full mapping
       lives in dev/roster.json, which is gitignored and stays on his machine.

       Hashing here is obfuscation, not protection. Anyone holding a list of
       candidate addresses can hash them and compare, and the salt would be in
       this file too. It stops the roster being READ off a public repo, which
       is the thing worth stopping. */
    allow: [
      '2614af7ee7e8c53ef4a0e77dff0b2741a7203d30f5cf562694a14b13ef43c7f0',   // 01 Amir C
      'a9c3e9d0c53b58efce25f1db355b3c76949e96385e4cbe174036f542a9d16054',   // 02 Alon Az
      'ad9c4134447e1be547483d80c15e920ee9b96e353d0217ccccd89fef9f77dd16',   // 03 Yoav Ad
      '98de5041b2d78a6c7705803706ff8359ae353b6ac0f3536a533125ba93e00f8e',   // 04 Tomer Ap
      '9d8a03a9a2c63f05d79602af80d164f1a58644686ec77f2890e04acc909ca520',   // 05 Evyatar
      '5b7778f288a1bc0845c92b7e69d37227237144fd43bf953abaf52dbbf530f81a',   // 06 Eyal Ya
      '5fa828b86d4512e0fd5b5993621ea5a41b7978d0116f13e12490c1afa2ea8dc5',   // 07 Yuval Fr
      'b7f89e9f0e1415ae5af93bb77022d49952e1d02c990e481afaed363bbfafff24',   // 08 Yuval Hg
      'd50d82301ebdd12c073e1ff284df29e360d8512e12535728d93210b657a8fd86',   // 09 Alon Be
      '609c5fe327dc3591cbd9b16505c86aecb38e65a265ba822cbdf3333a35bf6f7a',   // 10 Yuval Hp
      '38a09840f8a8763322fd2ccb66dcef22919ecda3be8f165a6f5b1aadf2fc68f1',   // 11 Guy Da
      'f4fe5972d5f51ebec5c98da4a6bbb82291d6b61ff7420b674f809a9d6a9d9fa3',   // 12 Liam Be
      '956b113888b639ad9dff2ebc3106866d9e682b8fa1a02d8766af92bd43941ef7',   // 13 Alon Go
      'b112c231421617b3d032ab3451ba1781b5a9089602aec03510e8f201cb84e7cc',   // 14 Noam Le
      'bcece65ee57082e24436d9868545233e70fd96c0064ce4d17def463b982c7640',   // 15 Eyal Sh
      '16544321969c956e4dcafaa7fa5b291bf4c2a3d2c0785f20017955a56eb21ac2',   // 16 R Lavie
      'bd7cab5365b6daeb7e9ab14c6c2b548028d348aea25edda0bb3b076c1e725749',   // 17 Alma No
      'cebf1e5c1f08f2a71babe70a9c820f1baf079bcc38586503ec3dd91cd8b4e464',   // 18 Gal Oh
      'cc81bf84abd3974663b843eaaccf9e80adffa0eeb57d736eaae1131eb591281b',   // 19 Yuval (4th)
      '7dc7a50f9f9314e04dc2b5132d7be19514b2c1161425de904e991f74c0f50e4c',   // 20 Bar Gl
      'f060175be0128f107ae34be95613ec7bd20b3e6415effbfe16b149b4b666ab61',   // 21 Ben Sh
      '5dab1702c10f9777737bc8a4a9cbdcdcf2cc853cdb02f56b140d499f77d2dd70',   // 22 Yair Za
      '7644a2de8e12a1a2bb92c9f994f27e2683f686320fa877a6d3f87d2fee826baa',   // 23 Yishai Am
      'afeb12968cba56fdae5ede45aab051d73fc03edec3f1846269beefbb343b6e6c',   // 24 Yish
      // Added 2026-08-08 to test the iOS side: an iPhone, and an account that
      // does NOT own the Google Cloud project, which is the pair we could not
      // test otherwise. Safe to delete this line once that is answered.
      '09c50b3124255f866d39fe8837c792f193bd3836c5bda2a05d5ee4c7e32f9ab8',   // 25 iOS test
      '997528f18e20f3a0e01cf6cc31b43907bb79ef278dbb135d6d55389364527ed2',   // 26 Spot
      // 27 is NOT a gmail — a custom domain. It only works if that address is
      // a Google account (Workspace, or a consumer account registered to it).
      // If it is Workspace, the org's admin can block third-party OAuth apps
      // outright, and no change here would fix that.
      '80bc6edc2a83bd09b5b0b9e638716e9dec0981ebc7b35e3e2d8a6b3f9e38a6d4',   // 27 Eitan

      /* --- מתקדם, added 2026-08-17 ------------------------------------- */
      '2704a19be63a23723fc169744bf936ceb187336d1602a60a7c17066fd4b8c3d1',   // 28 Eldad
      '9bff9951e19a7c9b06aa81bb0958d91bb918ae3725b682f907888f580e8486d1',   // 29 Royi
      '1ee58a61e35e64ca994ac1524279b14aaa71e132194d4df5c9831ac52c24d307',   // 30 Ishay
      '4090024390c7bba2028472b1cc114181529d7aa237c454d6cdcd2a576247edb9',   // 31 Y Birman
      '8e284fc9554028fd7e7e8af94c2dfbdc9e997720e0d59969ddf89413d9f65458',   // 32 Sagi
      '6c4e2f2c745c185e12826631a4b915a06542406765ab583bd35d66e92b245d37',   // 33 Rotem
      '349b0cf94ff53caeecec9ba8d7895aae092a070a68ea1e9be57e44ee538055ff',   // 34 Amit
      'd82f6f5232669fe381cff285ffc87c3ac5da68569da27905487e3ee96015ec60',   // 35 Alon Lavi
      'ce6cc33f87bf40cfd419966845e21c8b1d353d2eadc5a1beb4bf608a3e732431',   // 36 Guy M

      /* --- test account, added 2026-09-26 ------------------------------ */
      '317bb01e75d2d4e366ab0cc4c3f7b5512d2651ab40d2f5b15b4284e53f6c9b01'    // 37 Tester
    ],

    /* Which course each address is on. EVERY address is listed, on purpose:
       an untagged one falls through to the picker instead of being silently
       filed under the wrong syllabus, so forgetting to tag somebody costs them
       one question rather than the wrong chart. Nobody on this list is ever
       asked — the app just knows — and anyone can change it in הגדרות.
         node dev/check-access.js   prints the course each address resolves to. */
    courses: {
      '2614af7ee7e8c53ef4a0e77dff0b2741a7203d30f5cf562694a14b13ef43c7f0': 'rishoni',   //  1 Amircyment
      'a9c3e9d0c53b58efce25f1db355b3c76949e96385e4cbe174036f542a9d16054': 'rishoni',   //  2 Alon A
      'ad9c4134447e1be547483d80c15e920ee9b96e353d0217ccccd89fef9f77dd16': 'rishoni',   //  3 Yoavadiri
      '98de5041b2d78a6c7705803706ff8359ae353b6ac0f3536a533125ba93e00f8e': 'rishoni',   //  4 Tomer A
      '9d8a03a9a2c63f05d79602af80d164f1a58644686ec77f2890e04acc909ca520': 'rishoni',   //  5 Gershon E
      '5b7778f288a1bc0845c92b7e69d37227237144fd43bf953abaf52dbbf530f81a': 'rishoni',   //  6 Eyal Y
      '5fa828b86d4512e0fd5b5993621ea5a41b7978d0116f13e12490c1afa2ea8dc5': 'rishoni',   //  7 Yuvalfrankl
      'b7f89e9f0e1415ae5af93bb77022d49952e1d02c990e481afaed363bbfafff24': 'rishoni',   //  8 Yuval H
      'd50d82301ebdd12c073e1ff284df29e360d8512e12535728d93210b657a8fd86': 'rishoni',   //  9 Alonbenyacov
      '609c5fe327dc3591cbd9b16505c86aecb38e65a265ba822cbdf3333a35bf6f7a': 'rishoni',   // 10 Yuvalhalperin
      '38a09840f8a8763322fd2ccb66dcef22919ecda3be8f165a6f5b1aadf2fc68f1': 'rishoni',   // 11 Guydagan
      'f4fe5972d5f51ebec5c98da4a6bbb82291d6b61ff7420b674f809a9d6a9d9fa3': 'rishoni',   // 12 Liamberman
      '956b113888b639ad9dff2ebc3106866d9e682b8fa1a02d8766af92bd43941ef7': 'rishoni',   // 13 Alongorenn
      'b112c231421617b3d032ab3451ba1781b5a9089602aec03510e8f201cb84e7cc': 'rishoni',   // 14 Noamlev
      'bcece65ee57082e24436d9868545233e70fd96c0064ce4d17def463b982c7640': 'rishoni',   // 15 Eyal S
      '16544321969c956e4dcafaa7fa5b291bf4c2a3d2c0785f20017955a56eb21ac2': 'rishoni',   // 16 Rlavie
      'bd7cab5365b6daeb7e9ab14c6c2b548028d348aea25edda0bb3b076c1e725749': 'rishoni',   // 17 Alma N
      'cebf1e5c1f08f2a71babe70a9c820f1baf079bcc38586503ec3dd91cd8b4e464': 'rishoni',   // 18 Gal O
      'cc81bf84abd3974663b843eaaccf9e80adffa0eeb57d736eaae1131eb591281b': 'rishoni',   // 19 Yuval
      '7dc7a50f9f9314e04dc2b5132d7be19514b2c1161425de904e991f74c0f50e4c': 'rishoni',   // 20 Glassinbar
      'f060175be0128f107ae34be95613ec7bd20b3e6415effbfe16b149b4b666ab61': 'rishoni',   // 21 Shnaidermanben
      '5dab1702c10f9777737bc8a4a9cbdcdcf2cc853cdb02f56b140d499f77d2dd70': 'rishoni',   // 22 Yair Z
      '7644a2de8e12a1a2bb92c9f994f27e2683f686320fa877a6d3f87d2fee826baa': 'rishoni',   // 23 Yishaiamichai
      'afeb12968cba56fdae5ede45aab051d73fc03edec3f1846269beefbb343b6e6c': 'rishoni',   // 24 Yish
      '09c50b3124255f866d39fe8837c792f193bd3836c5bda2a05d5ee4c7e32f9ab8': 'rishoni',   // 25 Mom (iOS test)
      '997528f18e20f3a0e01cf6cc31b43907bb79ef278dbb135d6d55389364527ed2': 'mitkadem',   // 26 Spot
      '80bc6edc2a83bd09b5b0b9e638716e9dec0981ebc7b35e3e2d8a6b3f9e38a6d4': 'rishoni',   // 27 Eitan (r-ich.net)
      '2704a19be63a23723fc169744bf936ceb187336d1602a60a7c17066fd4b8c3d1': 'mitkadem',   // 28 Eldad N
      '9bff9951e19a7c9b06aa81bb0958d91bb918ae3725b682f907888f580e8486d1': 'mitkadem',   // 29 Royi P
      '1ee58a61e35e64ca994ac1524279b14aaa71e132194d4df5c9831ac52c24d307': 'mitkadem',   // 30 Ishay L
      '4090024390c7bba2028472b1cc114181529d7aa237c454d6cdcd2a576247edb9': 'mitkadem',   // 31 Y Birman
      '8e284fc9554028fd7e7e8af94c2dfbdc9e997720e0d59969ddf89413d9f65458': 'mitkadem',   // 32 Sagi S
      '6c4e2f2c745c185e12826631a4b915a06542406765ab583bd35d66e92b245d37': 'mitkadem',   // 33 Rotem G
      '349b0cf94ff53caeecec9ba8d7895aae092a070a68ea1e9be57e44ee538055ff': 'mitkadem',   // 34 Amit E
      'd82f6f5232669fe381cff285ffc87c3ac5da68569da27905487e3ee96015ec60': 'mitkadem',   // 35 Alon Lavi
      'ce6cc33f87bf40cfd419966845e21c8b1d353d2eadc5a1beb4bf608a3e732431': 'mitkadem',   // 36 Guy M
      '317bb01e75d2d4e366ab0cc4c3f7b5512d2651ab40d2f5b15b4284e53f6c9b01': 'rishoni'    // 37 Tester
    },

    /* How long a sign-in lasts before Google is asked again. Long on purpose:
       the session is read from the device, so the app still opens with no
       signal, which matters more here than a short window. */
    sessionDays: 30,

    /* Where Google sends him back. PINNED, and it has to stay pinned.
       Left empty this follows the page's own address, and there are two of
       those: the installed app starts at /sortie/index.html (the manifest's
       start_url) while Safari at the plain URL is /sortie/. Google treats those
       as different redirect URIs and only the first is registered, so following
       the page would give redirect_uri_mismatch to anyone who opened the plain
       URL. Pinning it means both routes come back to the same place, which is
       the same app and the same origin either way.
       Change this only alongside the Authorized redirect URIs in Google Cloud
       Console → Credentials, and re-run: node dev/check-oauth.js */
    redirectUri: 'https://yzgershon.github.io/sortie/index.html'
  };
})(window);
