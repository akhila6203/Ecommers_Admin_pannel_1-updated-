const slugify = require("slugify");
const generateSlug = (text) => {
  return slugify(text, {
    lower: true,
    strict: true,
    trim: true,
  });
};

const generateUniqueSlug = async (queryFn, text, excludeId = null) => {
  let slug = generateSlug(text);
  let counter = 1;
  let exists = true;

  while (exists) {
    const result = excludeId
      ? await queryFn(slug, excludeId)
      : await queryFn(slug);
    if (result) {
      slug = `${generateSlug(text)}-${counter}`;
      counter++;
    } else {
      exists = false;
    }
  }

  return slug;
};

module.exports.generateSlug = generateSlug;
module.exports.generateUniqueSlug = generateUniqueSlug;
