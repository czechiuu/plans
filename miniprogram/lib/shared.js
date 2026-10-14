var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// scripts/miniapp-shared-entry.mjs
var miniapp_shared_entry_exports = {};
__export(miniapp_shared_entry_exports, {
  calculateMealNutrition: () => calculateMealNutrition,
  exerciseById: () => exerciseById,
  exercises: () => exercises,
  validatePlan: () => validatePlan
});
module.exports = __toCommonJS(miniapp_shared_entry_exports);

// shared/exercises.js
var youtubeVideo = (id, provider, source) => ({
  url: `https://www.youtube.com/watch?v=${id}`,
  embed: `https://www.youtube.com/embed/${id}`,
  provider,
  license: "YouTube \u5B98\u65B9\u5D4C\u5165\u64AD\u653E\uFF1B\u65E0\u590D\u5236\u6216\u518D\u8BB8\u53EF\u6388\u6743",
  source,
  checkedDate: "2026-10-13",
  verificationStatus: "verified"
});
var ymcaVideo = (id) => youtubeVideo(id, "Kenosha YMCA / YouTube", "https://www.kenoshaymca.org/y-videos/");
var exercises = [
  {
    id: "machine_leg_press",
    name: "\u817F\u4E3E\u673A",
    equipment: "\u5750\u59FF\u817F\u4E3E\u673A",
    muscles: ["\u80A1\u56DB\u5934\u808C", "\u81C0\u808C"],
    start: "\u8C03\u6574\u5EA7\u6905\u4E0E\u811A\u8E0F\u8DDD\u79BB\uFF0C\u80CC\u548C\u81C0\u8D34\u4F4F\u9760\u57AB\uFF0C\u53CC\u811A\u7EA6\u4E0E\u9ACB\u540C\u5BBD\u8E29\u7A33\u811A\u8E0F\u3002",
    movement: "\u547C\u6C14\u65F6\u5E73\u7A33\u63A8\u5F00\uFF0C\u819D\u76D6\u4E0D\u9501\u6B7B\uFF1B\u5438\u6C14\u65F6\u7F13\u6162\u5C48\u819D\u56DE\u5230\u8212\u9002\u5E45\u5EA6\u3002",
    cues: ["\u811A\u8DDF\u6301\u7EED\u8D34\u7A33", "\u819D\u76D6\u671D\u5411\u811A\u5C16", "\u80CC\u548C\u81C0\u4E0D\u79BB\u5F00\u9760\u57AB"],
    errors: ["\u819D\u76D6\u5185\u6263\u6216\u9501\u6B7B", "\u56DE\u7A0B\u65F6\u81C0\u90E8\u5377\u8D77\u79BB\u57AB"],
    stopSignals: ["\u819D\u6216\u9ACB\u51FA\u73B0\u523A\u75DB", "\u5934\u6655\u6216\u80F8\u95F7"],
    textFallback: "\u5148\u8C03\u5EA7\u6905\u5E76\u9009\u8F7B\u91CD\u91CF\uFF1B\u8E29\u7A33\u811A\u8E0F\uFF0C\u5E73\u7A33\u63A8\u5F00\u518D\u7F13\u6162\u56DE\u7A0B\uFF0C\u4E0D\u9501\u819D\u3002",
    demo: ymcaVideo("QwBvFgAVOTo"),
    alternatives: ["dorm_sit_to_stand"],
    firstUseReminder: "\u9996\u6B21\u8BF7\u73B0\u573A\u6559\u7EC3\u6838\u5BF9\u5EA7\u6905\u3001\u8D77\u6B62\u9650\u4F4D\u548C\u91CD\u91CF\u3002"
  },
  {
    id: "machine_seated_row",
    name: "\u5750\u59FF\u5212\u8239\u673A",
    equipment: "\u5750\u59FF\u5212\u8239\u673A",
    muscles: ["\u80CC\u9614\u808C", "\u83F1\u5F62\u808C", "\u80B1\u4E8C\u5934\u808C"],
    start: "\u53CC\u811A\u8E29\u7A33\uFF0C\u5750\u76F4\u5E76\u63E1\u4F4F\u628A\u624B\uFF0C\u80A9\u653E\u677E\uFF0C\u624B\u81C2\u81EA\u7136\u4F38\u51FA\u3002",
    movement: "\u8098\u6CBF\u8EAB\u4F53\u4E24\u4FA7\u5411\u540E\u62C9\uFF0C\u80A9\u80DB\u5411\u540E\u6536\uFF1B\u505C\u987F\u540E\u7F13\u6162\u4F38\u81C2\u56DE\u4F4D\u3002",
    cues: ["\u8EAF\u5E72\u4FDD\u6301\u7A33\u5B9A", "\u7528\u8098\u5E26\u52A8\u62C9\u67C4", "\u56DE\u7A0B\u4E0D\u8038\u80A9"],
    errors: ["\u7528\u8EAB\u4F53\u5927\u5E45\u540E\u4EF0\u7529\u52A8", "\u62C9\u5230\u80A9\u8180\u8038\u8D77"],
    stopSignals: ["\u80A9\u6216\u80CC\u51FA\u73B0\u523A\u75DB", "\u5934\u6655\u6216\u80F8\u95F7"],
    textFallback: "\u5750\u7A33\u3001\u63E1\u67C4\uFF0C\u8098\u5411\u540E\u62C9\u5230\u8EAF\u5E72\u9644\u8FD1\uFF0C\u518D\u6709\u63A7\u5236\u5730\u56DE\u5230\u8D77\u70B9\u3002",
    demo: ymcaVideo("Hu1Pqz-6OIU"),
    alternatives: ["dorm_supported_dumbbell_row"],
    firstUseReminder: "\u9996\u6B21\u8BF7\u73B0\u573A\u6559\u7EC3\u6838\u5BF9\u628A\u624B\u3001\u5EA7\u4F4D\u548C\u6D3B\u52A8\u8303\u56F4\u3002"
  },
  {
    id: "machine_chest_press",
    name: "\u5750\u59FF\u80F8\u63A8\u673A",
    equipment: "\u5750\u59FF\u80F8\u63A8\u673A",
    muscles: ["\u80F8\u5927\u808C", "\u80B1\u4E09\u5934\u808C", "\u4E09\u89D2\u808C\u524D\u675F"],
    start: "\u8C03\u6574\u5EA7\u6905\u4F7F\u628A\u624B\u7EA6\u5728\u80F8\u4E2D\u90E8\uFF0C\u80CC\u8D34\u9760\u57AB\uFF0C\u53CC\u811A\u8E29\u7A33\u3002",
    movement: "\u547C\u6C14\u65F6\u5C06\u628A\u624B\u5411\u524D\u63A8\u51FA\uFF0C\u8098\u4E0D\u9501\u6B7B\uFF1B\u5438\u6C14\u65F6\u7F13\u6162\u56DE\u5230\u80F8\u4FA7\u3002",
    cues: ["\u624B\u8155\u4FDD\u6301\u5E73\u76F4", "\u80A9\u8180\u8D34\u7A33\u5E76\u4E0B\u6C89", "\u53CC\u4FA7\u5E73\u7A33\u540C\u6B65"],
    errors: ["\u8038\u80A9\u6216\u8170\u90E8\u8FC7\u5EA6\u62F1\u8D77", "\u7528\u60EF\u6027\u649E\u51FB\u914D\u91CD"],
    stopSignals: ["\u80A9\u6216\u80F8\u90E8\u75BC\u75DB", "\u5934\u6655\u6216\u80F8\u95F7"],
    textFallback: "\u8C03\u5EA7\u6905\u81F3\u628A\u624B\u4E0E\u80F8\u4E2D\u90E8\u9F50\u5E73\uFF0C\u7A33\u7A33\u524D\u63A8\u518D\u6162\u6162\u56DE\u4F4D\u3002",
    demo: ymcaVideo("0La1aFp-hKA"),
    alternatives: ["dorm_dumbbell_floor_press"],
    firstUseReminder: "\u9996\u6B21\u8BF7\u73B0\u573A\u6559\u7EC3\u6838\u5BF9\u5EA7\u6905\u9AD8\u5EA6\u548C\u5668\u68B0\u56DE\u7A0B\u8303\u56F4\u3002"
  },
  {
    id: "machine_seated_leg_curl",
    name: "\u5750\u59FF\u817F\u5F2F\u4E3E\u673A",
    equipment: "\u5750\u59FF\u817F\u5F2F\u4E3E\u673A",
    muscles: ["\u8158\u7EF3\u808C"],
    start: "\u8C03\u6574\u5EA7\u6905\u4E0E\u538B\u817F\u57AB\uFF0C\u4F7F\u819D\u5173\u8282\u5BF9\u9F50\u673A\u5668\u8F6C\u8F74\uFF0C\u5C0F\u817F\u653E\u5728\u6EDA\u57AB\u524D\u3002",
    movement: "\u5C48\u819D\u5E26\u52A8\u6EDA\u57AB\u5411\u4E0B\u6216\u5411\u540E\uFF0C\u77ED\u6682\u505C\u987F\uFF0C\u518D\u7F13\u6162\u4F38\u819D\u56DE\u4F4D\u3002",
    cues: ["\u9AA8\u76C6\u8D34\u7A33\u5EA7\u6905", "\u52A8\u4F5C\u6162\u4E14\u4E0D\u501F\u529B", "\u4EC5\u7528\u8212\u9002\u6D3B\u52A8\u8303\u56F4"],
    errors: ["\u9ACB\u90E8\u62AC\u8D77", "\u914D\u91CD\u7A81\u7136\u843D\u4E0B"],
    stopSignals: ["\u819D\u540E\u4FA7\u523A\u75DB", "\u62BD\u7B4B\u6216\u5934\u6655"],
    textFallback: "\u5148\u5BF9\u9F50\u8F6C\u8F74\u548C\u6EDA\u57AB\uFF0C\u5750\u7A33\u540E\u7F13\u6162\u5C48\u819D\u3001\u7F13\u6162\u56DE\u4F4D\u3002",
    demo: youtubeVideo("80AV3aCz65M", "GymCompany / YouTube", "https://www.lwsb.com/fitness-center-tutorials/"),
    alternatives: [],
    firstUseReminder: "\u4E0D\u540C\u673A\u5668\u6EDA\u57AB\u548C\u8F6C\u8F74\u4F4D\u7F6E\u4E0D\u540C\uFF0C\u9996\u6B21\u5FC5\u987B\u8BF7\u6559\u7EC3\u73B0\u573A\u8C03\u8282\u3002"
  },
  {
    id: "machine_lat_pulldown",
    name: "\u9AD8\u4F4D\u4E0B\u62C9\u673A",
    equipment: "\u9AD8\u4F4D\u4E0B\u62C9\u673A",
    muscles: ["\u80CC\u9614\u808C", "\u83F1\u5F62\u808C", "\u80B1\u4E8C\u5934\u808C"],
    start: "\u8C03\u5927\u817F\u56FA\u5B9A\u57AB\uFF0C\u53CC\u811A\u8E29\u7A33\uFF0C\u63E1\u6746\u7565\u5BBD\u4E8E\u80A9\uFF0C\u8EAF\u5E72\u76F4\u7ACB\u3002",
    movement: "\u8098\u5411\u4E0B\u62C9\u3001\u6746\u81F3\u4E0A\u80F8\u9644\u8FD1\uFF0C\u518D\u6709\u63A7\u5236\u5730\u5411\u4E0A\u4F38\u81C2\u3002",
    cues: ["\u80F8\u53E3\u81EA\u7136\u633A\u8D77", "\u80A9\u80DB\u5411\u4E0B\u6536", "\u8EAB\u4F53\u53EA\u8F7B\u5FAE\u540E\u503E"],
    errors: ["\u62C9\u5230\u9888\u540E", "\u7528\u8EAF\u5E72\u731B\u7529\u6216\u5927\u5E45\u540E\u4EF0"],
    stopSignals: ["\u80A9\u9888\u523A\u75DB", "\u5934\u6655\u6216\u80F8\u95F7"],
    textFallback: "\u56FA\u5B9A\u5927\u817F\uFF0C\u7A33\u7A33\u62C9\u6746\u5230\u4E0A\u80F8\uFF0C\u518D\u6162\u6162\u4F38\u81C2\u56DE\u4F4D\uFF1B\u4E0D\u8981\u62C9\u5230\u9888\u540E\u3002",
    demo: ymcaVideo("tK35eqRNrPM"),
    alternatives: ["dorm_supported_dumbbell_row"],
    firstUseReminder: "\u9996\u6B21\u8BF7\u73B0\u573A\u6559\u7EC3\u786E\u8BA4\u63E1\u8DDD\u3001\u56FA\u5B9A\u57AB\u548C\u91CD\u91CF\u3002"
  },
  {
    id: "machine_hip_abduction",
    name: "\u9ACB\u5916\u5C55\u673A",
    equipment: "\u5750\u59FF\u9ACB\u5916\u5C55\u673A",
    muscles: ["\u81C0\u4E2D\u808C", "\u81C0\u5C0F\u808C"],
    start: "\u8C03\u6574\u5EA7\u6905\u548C\u5927\u817F\u5916\u4FA7\u57AB\uFF0C\u80CC\u8D34\u9760\u57AB\uFF0C\u53CC\u811A\u8E29\u7A33\u3002",
    movement: "\u7F13\u6162\u5411\u5916\u6253\u5F00\u53CC\u817F\u81F3\u8212\u9002\u8303\u56F4\uFF0C\u518D\u6709\u63A7\u5236\u5730\u5408\u62E2\u3002",
    cues: ["\u9AA8\u76C6\u4FDD\u6301\u7A33\u5B9A", "\u5E45\u5EA6\u4EE5\u8212\u9002\u4E3A\u51C6", "\u4E0D\u7528\u60EF\u6027\u5F39\u5F00"],
    errors: ["\u8EAB\u4F53\u5DE6\u53F3\u6447\u6446", "\u914D\u91CD\u5FEB\u901F\u56DE\u5F39"],
    stopSignals: ["\u9ACB\u6216\u8179\u80A1\u6C9F\u523A\u75DB", "\u5934\u6655"],
    textFallback: "\u5750\u7A33\u5E76\u8F7B\u8D1F\u8377\u8D77\u6B65\uFF0C\u53CC\u817F\u5411\u5916\u7F13\u6162\u6253\u5F00\uFF0C\u518D\u7F13\u6162\u5408\u62E2\u3002",
    demo: ymcaVideo("RNLTuarDpTA"),
    alternatives: [],
    firstUseReminder: "\u9996\u6B21\u8BF7\u73B0\u573A\u6559\u7EC3\u533A\u5206\u5916\u5C55\u673A\u548C\u5185\u6536\u673A\uFF0C\u5E76\u786E\u8BA4\u5750\u57AB\u3001\u6321\u677F\u4E0E\u9650\u4F4D\u3002"
  },
  {
    id: "machine_ab_crunch",
    name: "\u8F7B\u8179\u5377\u8179\u673A",
    equipment: "\u5750\u59FF\u8179\u5377\u8179\u673A",
    muscles: ["\u8179\u76F4\u808C", "\u8179\u659C\u808C"],
    start: "\u8C03\u6574\u5EA7\u6905\u548C\u9760\u57AB\uFF0C\u53CC\u811A\u56FA\u5B9A\uFF0C\u9009\u62E9\u5F88\u8F7B\u7684\u963B\u529B\u3002",
    movement: "\u547C\u6C14\u65F6\u8BA9\u80F8\u5ED3\u5411\u9AA8\u76C6\u9760\u8FD1\uFF0C\u7F13\u6162\u5377\u8D77\uFF1B\u5438\u6C14\u65F6\u6709\u63A7\u5236\u5730\u56DE\u4F4D\u3002",
    cues: ["\u7528\u8179\u90E8\u53D1\u529B", "\u9888\u90E8\u4FDD\u6301\u653E\u677E", "\u5E45\u5EA6\u5C0F\u4E14\u53EF\u63A7"],
    errors: ["\u7528\u624B\u81C2\u731B\u62C9\u6216\u7529\u52A8", "\u9888\u90E8\u8FC7\u5EA6\u524D\u5C48"],
    stopSignals: ["\u8170\u80CC\u523A\u75DB", "\u5934\u6655\u6216\u80F8\u95F7"],
    textFallback: "\u9009\u5F88\u8F7B\u91CD\u91CF\uFF0C\u80F8\u5ED3\u7F13\u6162\u9760\u8FD1\u9AA8\u76C6\uFF0C\u518D\u6162\u6162\u56DE\u4F4D\uFF0C\u4E0D\u62C9\u626F\u9888\u90E8\u3002",
    demo: ymcaVideo("nlqEDo8odJM"),
    alternatives: ["dorm_dead_bug"],
    firstUseReminder: "\u9996\u6B21\u8BF7\u73B0\u573A\u6559\u7EC3\u786E\u8BA4\u5EA7\u6905\u548C\u6D3B\u52A8\u8303\u56F4\uFF1B\u8170\u80CC\u4E0D\u9002\u5148\u505C\u3002"
  },
  {
    id: "dorm_supported_dumbbell_row",
    name: "\u5BDD\u5BA4\u6276\u7A33\u5355\u81C2\u54D1\u94C3\u5212\u8239",
    equipment: "\u4E00\u53EA\u8F7B\u54D1\u94C3\u3001\u7A33\u56FA\u652F\u6491\u9762",
    muscles: ["\u80CC\u9614\u808C", "\u83F1\u5F62\u808C", "\u80B1\u4E8C\u5934\u808C"],
    start: "\u4E00\u624B\u6276\u7A33\u56FA\u684C\u9762\u6216\u5E8A\u67B6\uFF0C\u540C\u4FA7\u8EAF\u5E72\u4FDD\u6301\u7A33\u5B9A\uFF0C\u53E6\u4E00\u624B\u6301\u8F7B\u54D1\u94C3\u81EA\u7136\u4E0B\u5782\u3002",
    movement: "\u6301\u94C3\u4FA7\u8098\u6CBF\u8EAB\u4F53\u5411\u540E\u4E0A\u65B9\u62C9\uFF0C\u968F\u540E\u7F13\u6162\u4E0B\u653E\uFF1B\u5B8C\u6210\u4E00\u4FA7\u518D\u6362\u8FB9\u3002",
    cues: ["\u80CC\u90E8\u4FDD\u6301\u81EA\u7136\u5E73\u76F4", "\u80A9\u4E0D\u8038\u8D77", "\u4E24\u4FA7\u52A8\u4F5C\u5E45\u5EA6\u76F8\u8FD1"],
    errors: ["\u6276\u53EF\u79FB\u52A8\u7684\u6905\u5B50", "\u626D\u8F6C\u8170\u90E8\u7529\u94C3"],
    stopSignals: ["\u8170\u80CC\u6216\u80A9\u523A\u75DB", "\u652F\u6491\u9762\u6643\u52A8"],
    textFallback: "\u6276\u7A33\u56FA\u5B9A\u652F\u6491\uFF0C\u8F7B\u54D1\u94C3\u6CBF\u8EAB\u4F53\u62C9\u5230\u9ACB\u65C1\uFF0C\u518D\u7F13\u6162\u653E\u4E0B\uFF1B\u652F\u6491\u4E0D\u7A33\u5C31\u4E0D\u505A\u3002",
    demo: youtubeVideo("q65uDGJ9ZPs", "ATHLEAN-X / YouTube", "https://www.youtube.com/watch?v=q65uDGJ9ZPs"),
    alternatives: ["machine_seated_row"],
    firstUseReminder: "\u9996\u6B21\u8BF7\u6559\u7EC3\u786E\u8BA4\u652F\u6491\u7269\u7A33\u56FA\uFF1B\u5B98\u65B9\u793A\u4F8B\u7528\u8BAD\u7EC3\u51F3\uFF0C\u5BDD\u5BA4\u5BB6\u5177\u4E0D\u4E00\u5B9A\u7B49\u540C\u3002"
  },
  {
    id: "dorm_dumbbell_floor_press",
    name: "\u5730\u677F\u54D1\u94C3\u5367\u63A8",
    equipment: "\u4E00\u5BF9\u8F7B\u54D1\u94C3\u3001\u5E73\u6574\u5730\u9762\u3001\u8BAD\u7EC3\u57AB",
    muscles: ["\u80F8\u5927\u808C", "\u80B1\u4E09\u5934\u808C", "\u4E09\u89D2\u808C\u524D\u675F"],
    start: "\u5750\u5230\u5730\u9762\u518D\u5B89\u5168\u8EBA\u4E0B\uFF0C\u5C48\u819D\u8E29\u5730\uFF0C\u8F7B\u54D1\u94C3\u5728\u80F8\u4FA7\uFF0C\u524D\u81C2\u8FD1\u4E4E\u7AD6\u76F4\u3002",
    movement: "\u547C\u6C14\u65F6\u5411\u4E0A\u63A8\u54D1\u94C3\uFF0C\u8098\u4E0D\u9501\u6B7B\uFF1B\u7F13\u6162\u4E0B\u653E\u76F4\u5230\u4E0A\u81C2\u8F7B\u89E6\u5730\u9762\u3002",
    cues: ["\u624B\u8155\u4FDD\u6301\u5E73\u76F4", "\u80A9\u80DB\u7A33\u5B9A", "\u53CC\u4FA7\u540C\u6B65\u4E14\u4E0D\u7528\u5927\u91CD\u91CF"],
    errors: ["\u4E0A\u81C2\u649E\u51FB\u5730\u9762", "\u8170\u90E8\u8FC7\u5EA6\u62F1\u8D77"],
    stopSignals: ["\u80A9\u6216\u80F8\u90E8\u75BC\u75DB", "\u54D1\u94C3\u5931\u63A7\u6216\u5934\u6655"],
    textFallback: "\u5E73\u8EBA\u5C48\u819D\uFF0C\u8F7B\u54D1\u94C3\u4ECE\u80F8\u4FA7\u5E73\u7A33\u63A8\u8D77\uFF0C\u6162\u6162\u4E0B\u653E\u5230\u4E0A\u81C2\u8F7B\u89E6\u5730\u9762\u3002",
    demo: youtubeVideo("vagdk94bFn4", "Runna / YouTube", "https://support.runna.com/en/articles/6413209-floor-dumbbell-bench-press-exercise-tutorial"),
    alternatives: ["machine_chest_press"],
    firstUseReminder: "\u9996\u6B21\u8BF7\u6559\u7EC3\u786E\u8BA4\u8D77\u843D\u54D1\u94C3\u65B9\u5F0F\uFF1B\u4E0D\u8981\u72EC\u81EA\u5C1D\u8BD5\u65E0\u6CD5\u7A33\u5B9A\u63A7\u5236\u7684\u91CD\u91CF\u3002"
  },
  {
    id: "dorm_sit_to_stand",
    name: "\u5750\u4E0B\u8D77\u7ACB",
    equipment: "\u7A33\u56FA\u4E14\u4E0D\u4F1A\u6ED1\u52A8\u7684\u6905\u5B50",
    muscles: ["\u80A1\u56DB\u5934\u808C", "\u81C0\u808C"],
    start: "\u6905\u5B50\u9760\u5899\u6216\u56FA\u5B9A\uFF0C\u53CC\u811A\u8E29\u5730\u7EA6\u4E0E\u9ACB\u540C\u5BBD\uFF0C\u5750\u5728\u6905\u9762\u524D\u534A\u90E8\u3002",
    movement: "\u8EAB\u4F53\u8F7B\u5FAE\u524D\u503E\u3001\u811A\u8E29\u5730\u7AD9\u8D77\uFF0C\u7AD9\u7A33\u540E\u7F13\u6162\u5750\u56DE\u3002",
    cues: ["\u819D\u76D6\u671D\u811A\u5C16\u65B9\u5411", "\u5148\u7AD9\u7A33\u518D\u5750\u4E0B", "\u5168\u7A0B\u63A7\u5236\u901F\u5EA6"],
    errors: ["\u6905\u5B50\u6ED1\u52A8", "\u8D77\u8EAB\u65F6\u819D\u76D6\u660E\u663E\u5185\u6263"],
    stopSignals: ["\u819D\u9ACB\u523A\u75DB", "\u5931\u53BB\u5E73\u8861\u6216\u5934\u6655"],
    textFallback: "\u7528\u9760\u5899\u7A33\u56FA\u6905\u5B50\uFF0C\u811A\u8E29\u7A33\uFF0C\u5E73\u7A33\u7AD9\u8D77\u540E\u6162\u6162\u5750\u4E0B\u3002",
    demo: youtubeVideo("29WFLqHgYZ0", "NHS inform / YouTube", "https://www.youtube.com/watch?v=29WFLqHgYZ0"),
    alternatives: ["machine_leg_press"],
    firstUseReminder: "\u9996\u6B21\u8BF7\u786E\u8BA4\u6905\u5B50\u7A33\u56FA\uFF0C\u5FC5\u8981\u65F6\u7531\u4EBA\u5728\u65C1\u4FDD\u62A4\u3002"
  },
  {
    id: "dorm_dead_bug",
    name: "\u6B7B\u866B",
    equipment: "\u8BAD\u7EC3\u57AB",
    muscles: ["\u8179\u6A2A\u808C", "\u8179\u76F4\u808C"],
    start: "\u5E73\u8EBA\u5C48\u9ACB\u5C48\u819D\u7EA6\u4E5D\u5341\u5EA6\uFF0C\u53CC\u81C2\u671D\u4E0A\uFF0C\u8F7B\u6536\u8179\u5E76\u4FDD\u6301\u81EA\u7136\u547C\u5438\u3002",
    movement: "\u7F13\u6162\u4F38\u51FA\u4E00\u4FA7\u817F\u548C\u5BF9\u4FA7\u624B\u81C2\uFF0C\u56DE\u5230\u8D77\u70B9\u540E\u6362\u8FB9\u3002",
    cues: ["\u8170\u80CC\u4FDD\u6301\u7A33\u5B9A", "\u56DB\u80A2\u53EA\u4F38\u5230\u53EF\u63A7\u8303\u56F4", "\u5168\u7A0B\u547C\u5438\u4E0D\u505C"],
    errors: ["\u4E3A\u4E86\u4F38\u8FDC\u800C\u8170\u90E8\u660E\u663E\u62F1\u8D77", "\u52A8\u4F5C\u8FC7\u5FEB\u6216\u618B\u6C14"],
    stopSignals: ["\u8170\u80CC\u523A\u75DB", "\u5934\u6655\u6216\u80F8\u95F7"],
    textFallback: "\u5E73\u8EBA\u62AC\u624B\u5C48\u817F\uFF0C\u4EA4\u66FF\u7F13\u6162\u4F38\u51FA\u5BF9\u4FA7\u624B\u811A\uFF1B\u8170\u80CC\u4E0D\u7A33\u5C31\u7F29\u5C0F\u5E45\u5EA6\u3002",
    demo: youtubeVideo("bxn9FBrt4-A", "NASM / YouTube", "https://www.nasm.org/resource-center/exercise-library/dead-bug"),
    alternatives: ["machine_ab_crunch"],
    firstUseReminder: "\u9996\u6B21\u4EE5\u80FD\u7A33\u5B9A\u63A7\u5236\u8170\u80CC\u7684\u5E45\u5EA6\u4E3A\u51C6\uFF0C\u4E0D\u8FFD\u6C42\u624B\u811A\u8D34\u5730\u3002"
  }
];
var gifIds = {
  machine_seated_row: "7I6LNUG",
  machine_chest_press: "DOoWcnA",
  machine_seated_leg_curl: "Zg3XY7P"
};
for (const exercise of exercises) {
  const gifId = gifIds[exercise.id];
  exercise.demo.mediaType = gifId ? "external_gif" : "source_video";
  if (gifId) {
    exercise.demo.gifUrl = `https://static.exercisedb.dev/media/${gifId}.gif`;
    exercise.demo.gifSource = "https://ascendapi.com/";
    exercise.demo.gifLicense = "\u4EC5\u4E2A\u4EBA\uFF0F\u975E\u5546\u4E1A\u4F7F\u7528\uFF0C\u9700\u6807\u6CE8 AscendAPI / ExerciseDB";
  }
}
var exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));

// shared/health.js
var integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
var text = (value, max) => typeof value === "string" && value.length <= max;
var time = (value) => value === null || typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
var keys = (value, allowed) => Object.keys(value).every((key) => allowed.includes(key));
var planItemKeys = ["exercise_id", "sets", "reps", "work_seconds", "rest_seconds", "transition_seconds", "first_use_check", "short_option"];
function validatePlan(content, { automatic = false } = {}) {
  var _a, _b;
  if (!content || typeof content !== "object" || Array.isArray(content) || !keys(content, ["summary", "meals", "training", "warnings"]) || !text(content.summary, 1e3) || !Array.isArray(content.meals) || content.meals.length > 8 || !Array.isArray(content.warnings) || content.warnings.length > 20 || !content.warnings.every((item) => text(item, 300))) return false;
  for (const meal of content.meals) {
    if (!meal || typeof meal !== "object" || Array.isArray(meal) || !keys(meal, ["time", "title", "foods", "prep_method", "purchase_or_prep", "alternative", "notes", "snack_reason"]) || !time(meal.time) || !text(meal.title, 200) || !Array.isArray(meal.foods) || meal.foods.length > 15 || !meal.foods.every((food) => food && text(food.name, 200) && text(food.portion, 100) && text(food.unit, 60)) || !["prep_method", "purchase_or_prep", "alternative", "notes"].every((k) => text(meal[k], 500)) || !(meal.snack_reason === null || text(meal.snack_reason, 300))) return false;
  }
  const t = content.training;
  if (!t || typeof t !== "object" || Array.isArray(t) || !keys(t, ["mode", "purpose", "time", "intensity", "equipment", "muscles", "warmup", "items", "cooldown", "total_seconds"]) || !["rest", "workout"].includes(t.mode) || !text(t.purpose, 300) || !time(t.time) || !text(t.intensity, 100) || !text(t.equipment, 150) || !Array.isArray(t.muscles) || !t.muscles.every((x) => text(x, 80)) || !Array.isArray(t.items) || t.items.length > 3 || !Array.isArray(t.warmup) || t.warmup.length > 8 || !Array.isArray(t.cooldown) || t.cooldown.length > 8 || !integer(t.total_seconds, 0, 999999)) return false;
  let seconds = 0;
  for (const step of [...t.warmup, ...t.cooldown]) {
    if (!step || !text(step.description, 300) || !integer(step.seconds, 0, 9999)) return false;
    seconds += step.seconds;
  }
  for (const item of t.items) {
    if (!item || typeof item !== "object" || !keys(item, planItemKeys) || !exerciseById.has(item.exercise_id) || automatic && ((_b = (_a = exerciseById.get(item.exercise_id)) == null ? void 0 : _a.demo) == null ? void 0 : _b.verificationStatus) !== "verified" || !integer(item.sets, 1, 2) || !integer(item.reps, 0, 999) || !integer(item.work_seconds, 1, 120) || !integer(item.rest_seconds, item.sets > 1 ? 30 : 0, 9999) || !integer(item.transition_seconds, 0, 9999) || !text(item.first_use_check, 300) || !text(item.short_option, 300)) return false;
    seconds += item.sets * item.work_seconds + (item.sets - 1) * item.rest_seconds + item.transition_seconds;
  }
  return (t.mode !== "rest" || t.items.length === 0 && seconds === 0) && (t.mode !== "workout" || t.items.length >= 1 && seconds <= 3600) && seconds === t.total_seconds;
}

// shared/meal-nutrition.js
function validateNutritionItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return ["item"];
  const fields = [];
  if (typeof item.name !== "string" || !item.name.trim()) fields.push("name");
  for (const field of ["grams_min", "grams_max", "kcal_per_100g"]) {
    if (!Number.isFinite(item[field]) || item[field] < 0) fields.push(field);
  }
  if (Number.isFinite(item.grams_min) && Number.isFinite(item.grams_max) && item.grams_max < item.grams_min)
    fields.push("grams_max");
  if (typeof item.nutrition_source !== "string" || !item.nutrition_source.trim()) fields.push("nutrition_source");
  return [...new Set(fields)];
}
function calculateMealNutrition(items, { eaten_fraction = 1, additions_status = "unmeasured" } = {}) {
  if (!Array.isArray(items)) throw new TypeError("Meal items must be an array");
  if (!Number.isFinite(eaten_fraction) || eaten_fraction < 0 || eaten_fraction > 1)
    throw new RangeError("eaten_fraction must be a number from 0 to 1");
  if (!["none", "included", "unmeasured"].includes(additions_status))
    throw new RangeError("Invalid additions_status");
  const gaps = items.flatMap((item, index) => {
    const fields = validateNutritionItem(item);
    return fields.length ? [{ index, name: typeof (item == null ? void 0 : item.name) === "string" ? item.name : "", fields }] : [];
  });
  if (!items.length) gaps.push({ index: null, name: "\u98DF\u7269\u6E05\u5355", fields: ["items"] });
  if (additions_status === "unmeasured") gaps.push({ index: null, name: "\u672A\u8BA1\u5165\u7684\u6CB9\u6216\u9171\u6C41", fields: ["additions_status"] });
  const result = {
    complete: gaps.length === 0,
    energy_min_kcal: null,
    energy_max_kcal: null,
    consumed_min_kcal: null,
    consumed_max_kcal: null,
    gaps,
    additions_status
  };
  if (!result.complete) return result;
  for (const edge of ["min", "max"]) {
    const energy = items.reduce((total, item) => total + item[`grams_${edge}`] / 100 * item.kcal_per_100g, 0);
    if (!Number.isFinite(energy)) throw new RangeError("Meal energy exceeds numeric range");
    result[`energy_${edge}_kcal`] = energy;
    result[`consumed_${edge}_kcal`] = energy * eaten_fraction;
  }
  return result;
}
