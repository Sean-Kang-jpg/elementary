# News Content Contract

The v2.1 news tab is an empty destination shell. Do not publish generated or placeholder stories. A feed becomes active only after reviewed content exists.

## Categories

- `regional_report`: district or neighborhood statistics and interpretation.
- `school_news`: sourced school notices and education-office news.
- `education_books`: editor-authored reviews for elementary families.

## Source And Review

Store editorial content separately from `school_master` and `school_apartment_serving`. Every item needs a source URL or an internal author, a reviewer, and an explicit publication state: `draft`, `review`, `published`, or `archived`. External text must be summarized and linked, not copied.

## Future Record Shape

Use stable fields such as `content_id`, `category`, `title`, `summary`, `body`, `region`, `district`, `school_ids`, `source_url`, `author`, `reviewer`, `published_at`, and `status`. Images require usage rights and descriptive alt text.

## Frontend Gate

Before enabling a published feed, implement loading, empty, error, detail, and share states. Only `published` records are public. Keep authoring and review behind authenticated administrator access.
