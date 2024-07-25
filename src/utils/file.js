const fs = require('fs');
const core = require('@actions/core');
const github = require('@actions/github');
const { commitMessage, readmePath, token } = require('../config');

// Function to update README.md and push changes
async function updateReadme(activity) {
    try {
        if (!activity || activity.trim().length === 0) {
            console.warn('⚠️ No activity to update. The README.md will not be changed.');
            return;
        }

        const readmeContent = fs.readFileSync(readmePath, 'utf-8');
        const startMarker = '<!--START_SECTION:activity-->';
        const endMarker = '<!--END_SECTION:activity-->';

        const startIdx = readmeContent.indexOf(startMarker);
        const endIdx = readmeContent.indexOf(endMarker);

        if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) {
            throw new Error('❌ Section markers not found or invalid in README.md.');
        }

        const updatedContent = [
            readmeContent.substring(0, startIdx + startMarker.length),
            '\n',
            activity,
            '\n',
            readmeContent.substring(endIdx)
        ].join('');

        fs.writeFileSync(readmePath, updatedContent, 'utf-8');
        console.log('✅ README.md updated successfully!');

        // Use @actions/github to commit and push changes
        const octokit = github.getOctokit(token);

        const { owner, repo } = github.context.repo;
        const branch = github.context.ref.replace('refs/heads/', '');

        // Get the last commit SHA
        const { data: refData } = await octokit.rest.git.getRef({
            owner,
            repo,
            ref: `heads/${branch}`
        });

        const lastCommitSha = refData.object.sha;

        // Get the tree SHA
        const { data: commitData } = await octokit.rest.git.getCommit({
            owner,
            repo,
            commit_sha: lastCommitSha
        });

        const treeSha = commitData.tree.sha;

        // Create a new tree with the updated README
        const { data: newTree } = await octokit.rest.git.createTree({
            owner,
            repo,
            base_tree: treeSha,
            tree: [{
                path: readmePath.replace(/^.*[\\\/]/, ''),
                mode: '100644',
                type: 'blob',
                content: updatedContent
            }]
        });

        // Create a new commit with the author set to github-actions[bot]
        const { data: newCommit } = await octokit.rest.git.createCommit({
            owner,
            repo,
            message: commitMessage,
            tree: newTree.sha,
            parents: [lastCommitSha],
            author: {
                name: 'github-actions[bot]',
                email: 'github-actions[bot]@users.noreply.github.com',
                date: new Date().toISOString()
            }
        });

        // Update the reference to point to the new commit
        await octokit.rest.git.updateRef({
            owner,
            repo,
            ref: `heads/${branch}`,
            sha: newCommit.sha
        });

        // Construct the commit URL
        const commitUrl = `https://github.com/${owner}/${repo}/commit/${newCommit.sha}`;
        console.log(`✅ Changes pushed to the repository! Commit: ${commitUrl}`);
    } catch (error) {
        core.setFailed(`❌ Error updating README.md: ${error.message}`);
    }
}

module.exports = {
    updateReadme,
};