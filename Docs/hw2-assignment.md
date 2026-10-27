Objective

Set up your P2 project for AI-assisted development by creating effective rules files and an Agile workflow. You'll bridge the gap between your PRD/mockups (Claude Web, Weeks 3-5) and IDE-centric development (Weeks 6+) by creating instructions that help your AI tools understand your project, follow Scrum practices, and start from your existing designs.
Prerequisites

Before starting this assignment, you should have:

    A PRD (from P1/P2 planning) with user stories and acceptance criteria
    At least one mockup or prototype (from Claude Web Artifacts or Figma)
    Your P2 repository created on GitHub
    Antigravity (or equivalent IDE AI tool) installed

Tasks
1. Set Up Scrum Workflow on GitHub (25%)

Create a professional Agile workflow using GitHub Issues and Projects:

    Create a GitHub Project board (Board layout) with columns: Backlog, Sprint Todo, In Progress, In Review, Done
    Create milestones for Sprint 1 and Sprint 2 (with due dates matching your P2 timeline)
    Break your PRD into GitHub Issues — Turn each user story into one or more issues with:
        Clear title (action-oriented)
        Acceptance criteria as a checklist in the issue body
        Labels (feature, bug, chore, docs, priority labels)
        Milestone assignment (Sprint 1 or Sprint 2)
    Create at least 10 issues across your two sprints
    Assign Sprint 1 issues to the "Sprint Todo" column

2. Create Rules / Instructions Files (35%)

Create a comprehensive AGENTS.md file for your P2 project (older names such as .antigravityrules, CLAUDE.md or .cursorrules are still accepted) that includes:

Project Context:

    Tech stack and versions
    Architecture overview (folder structure, key patterns)
    Naming conventions and coding standards
    Testing strategy (framework, patterns, coverage goals)

PRD & Design References:

    Link or reference to your PRD document
    Description of your mockup/prototype designs
    Key UI components and their expected behavior
    User flow descriptions that the AI should follow when implementing features

Scrum & Workflow Instructions:

    Branch naming convention (e.g., feature/42-description)
    Commit message format
    PR workflow (link to issues, required reviews)
    How to reference GitHub Issues in code and commits

Do's and Don'ts:

    Patterns to follow and patterns to avoid
    Dependencies and libraries to prefer
    Security and accessibility requirements

3. Test Your Rules with a Real Feature (25%)

Demonstrate that your rules file makes a measurable difference:

    Pick one feature from your Sprint 1 backlog (a GitHub Issue)
    Implement it WITHOUT rules active — Start a fresh chat, disable or remove the rules file, and ask the AI to implement the feature based on a brief description only
    Implement it WITH rules active — Same feature, clean start, but with your rules file in place and referencing your PRD/mockups
    Compare the results — Document specific differences in:
        Code quality and consistency with your project patterns
        How well the AI understood the design/mockup intent
        Adherence to your naming conventions and architecture
        Quality of tests generated

4. Refine and Document (15%)

    Iterate on your rules file based on the test results
    Document what worked, what didn't, and what you changed
    Write a brief reflection (1-2 pages) covering:
        How your rules file bridges PRD/mockups to implementation
        How the Scrum setup on GitHub helps organize AI-assisted development
        What you would add or change for Sprint 2
