const ONE_SECOND = 1000; //ms
const ONE_MINUTE = 60 * ONE_SECOND;

// Default settings
const DEFAULT_SETTINGS = {
  active: true,
  useGPT: true,
  apiKey: "",
  commentLength: "15",
  autoPostEnabled: true,
  dailyLimit: 20,
  minDelay: 5 * ONE_MINUTE,
  maxDelay: 10 * ONE_MINUTE,
  likePostEnabled: true,
  userPrompt:`Match the tone without deviation;
  be supportive, non-aggressive, and use direct address ('you'/'your');
  keep the comment WITHIN {{MAX_WORDS}} words;
  be engaging;
  add some value to the post through the comment;
  ask questions about the post only if needed;
  Successful comment example Output: Good to hear you’ve learned the MERN stack!`,
  isFeedCommenterActive: true,
};

const defaultStartPrompt = `You are a professional comment generator. You will generate a concise, professional, and personalized comment based on the user's post. 
Follow these rules:`;

const defaultEndPrompt = `
reference specific details from the post;
if unable to generate comment, return NULL. 
Output only the comment text or NULL.
If the post contains profanity, hate speech, slurs, or violates content policies, return NULL;
Output should not contain any explanations, markdown, or extra text.  
Failed comment example output: NULL`;


const CommentLengthToWordsLength = {
  short: "30",
  medium: "30 - 60",
  long: "60 - 120",
};
const MaxTokens = {
  short: 75,
  medium: 150,
  long: 250,
};

const APIURL = `https://app.manageplus.io/admin/api`;
const WEBURL = `https://app.manageplus.io`;

module.exports = {
  DEFAULT_SETTINGS,
  ONE_SECOND,
  ONE_MINUTE,
  CommentLengthToWordsLength,
  defaultStartPrompt,
  defaultEndPrompt,

  MaxTokens,
  APIURL,
  WEBURL,
};
