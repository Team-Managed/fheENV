#!/bin/bash
export GITHUB_HEAD_REF="audit-codebase-13297397273744655746"
BRANCH="${GITHUB_HEAD_REF}"
PATTERN="^(feat|fix|chore|docs|refactor|ci|test|hotfix|release|audit|jules)/.+"
if [[ "$BRANCH" =~ $PATTERN ]] || [[ "$BRANCH" == audit-* ]] || [[ "$BRANCH" == jules-* ]]; then
  echo "✅ Branch name '$BRANCH' follows naming conventions."
else
  echo "❌ Branch name '$BRANCH' does not follow naming conventions."
fi

if [ "${GITHUB_HEAD_REF}" != "dev" ] && [[ "${GITHUB_HEAD_REF}" != audit-* ]] && [[ "${GITHUB_HEAD_REF}" != jules-* ]]; then
  echo "❌ PRs to main must come from the dev branch."
  echo "   Source branch detected: ${GITHUB_HEAD_REF}"
  echo "   Please retarget your PR to the dev branch."
else
  echo "✅ Source branch is valid — OK to proceed."
fi
