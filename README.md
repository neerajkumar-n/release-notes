# Hyperswitch Release Notes Dashboard

A modern Next.js application that automatically fetches, parses, and displays Hyperswitch release notes from the GitHub changelog with AI-powered enhancements.

## 🌟 Features

- **Automated Changelog Parsing**: Fetches and parses release notes from the [Hyperswitch CHANGELOG](https://github.com/juspay/hyperswitch/blob/main/CHANGELOG.md)
- **AI-Enhanced Descriptions**: Uses LiteLLM/OpenAI to generate professional, business-friendly descriptions
- **Executive & List Views**: Toggle between executive summary view and detailed list view
- **Advanced Filtering**: Filter by connector, type (Feature/Bug Fix), and date range
- **Dark Mode**: Beautiful dark/light theme toggle
- **Weekly Grouping**: Automatically groups releases by week (Wednesday cycles)
- **Modern UI**: Built with Tailwind CSS featuring smooth animations and responsive design

## 📋 Prerequisites

- **Node.js** 18.x or later
- **npm** or **yarn** package manager
- **API Access**: LiteLLM or OpenAI API credentials (optional, for AI enhancements)

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd release-notes
```

### 2. Install Dependencies

```bash
npm install
# or
yarn install
```

### 3. Configure Environment Variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit the `.env` file with your configuration:

```env
# AI Configuration (Optional - for enhanced descriptions)
AI_API_KEY=your_api_key_here
AI_BASE_URL=https://grid.ai.juspay.net
AI_MODEL_ID=glm-latest
AI_TEMPERATURE=0.7
```

> **Note**: If you don't configure AI credentials, the app will still work but without enhanced descriptions.

### 4. Run the Development Server

```bash
npm run dev
# or
yarn dev
```

The application will be available at [http://localhost:3000](http://localhost:3000)

### 5. Build for Production

```bash
npm run build
npm start
# or
yarn build
yarn start
```

## 📁 Project Structure

```
release-notes/
├── app/                          # Next.js App Router
│   ├── api/                      # API Routes
│   │   ├── release-notes/        # Fetches & parses changelog
│   │   ├── enhance-items/        # AI enhancement endpoint
│   │   ├── generate-summary/     # Summary generation
│   │   └── test-llm/             # LLM testing endpoint
│   ├── globals.css               # Global styles
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Main dashboard page
├── lib/
│   └── llm-enhancer.ts           # AI enhancement logic
├── grace/                        # Grace CLI Tool (separate project)
│   ├── README.md                 # Grace documentation
│   ├── pyproject.toml            # Python dependencies
│   └── src/                      # Grace source code
├── .env                          # Environment variables (gitignored)
├── package.json                  # Node.js dependencies
├── tsconfig.json                 # TypeScript configuration
├── tailwind.config.js            # Tailwind CSS configuration
└── README.md                     # This file
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `AI_API_KEY` | API key for AI service | - | No |
| `AI_BASE_URL` | Base URL for AI service | `https://grid.ai.juspay.net` | No |
| `AI_MODEL_ID` | AI model identifier | `glm-latest` | No |
| `AI_TEMPERATURE` | AI temperature setting | `0.7` | No |

### AI Enhancement

The application uses AI to enhance release notes with:
- **Enhanced Titles**: Clear, professional titles (5-10 words)
- **Descriptions**: Detailed explanations (1-2 sentences)
- **Business Impact**: Customer-focused value propositions

Enhancement is performed automatically in the background when data loads, processing items in batches of 5 to avoid rate limits.

## 🎨 Features in Detail

### View Modes

**Executive View**
- Categorized by:
  - Global Connectivity (Connector-specific updates)
  - Merchant Experience
  - Security & Governance
  - Core Platform & Reliability
- Professional, business-friendly presentation

**List View**
- Chronological list of all changes
- Feature/Bug Fix badges
- Direct links to GitHub PRs

### Filters

- **Connector Filter**: Filter by specific payment connector
- **Type Filter**: Show only Features or Bug Fixes
- **Date Range**: Filter releases between specific dates

### UI Components

- **Dark Mode Toggle**: Seamless theme switching
- **Loading States**: Elegant loading indicators
- **Enhancement Progress**: Real-time AI enhancement progress
- **Responsive Design**: Works on desktop, tablet, and mobile

## 🛠️ Development

### Code Quality

Run TypeScript checks:
```bash
npm run lint
# or
yarn lint
```

### Key Technologies

- **Next.js 14+**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **date-fns**: Date manipulation
- **Lucide React**: Icon library
- **OpenAI SDK**: AI integration

## 🐛 Troubleshooting

### Common Issues

**Issue: AI enhancement not working**
- Check that `AI_API_KEY` is set correctly in `.env`
- Verify the API base URL is accessible
- Check browser console for detailed error messages

**Issue: No release notes showing**
- Verify internet connection (app fetches from GitHub)
- Check browser console for API errors
- Try refreshing the page

**Issue: Rate limiting errors**
- The app processes items in batches of 5 to avoid rate limits
- Wait a few minutes and refresh
- Consider using a different AI provider

### Development Tips

1. **Hot Reload**: Next.js supports hot module replacement - your changes will reflect immediately
2. **API Testing**: Use the `/api/test-llm` endpoint to test AI configuration
3. **Debugging**: Check network tab in browser DevTools for API calls
4. **Console Logs**: The app includes detailed console logging for troubleshooting

## 📦 Grace CLI (Bonus Tool)

This repository includes the Grace CLI tool in the `grace/` directory - an intelligent research and technical specification generator.

### Grace Quick Start

```bash
cd grace
uv sync
source .venv/bin/activate

# Configure Grace
cp .env.example .env
# Edit .env with your API keys

# Run techspec workflow
grace techspec
```

See [grace/README.md](grace/README.md) for full documentation.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is part of the Hyperswitch ecosystem. See main repository for license information.

## 🔗 Related Links

- [Hyperswitch Repository](https://github.com/juspay/hyperswitch)
- [Hyperswitch Documentation](https://hyperswitch.io/docs)
- [Next.js Documentation](https://nextjs.org/docs)

## 💡 Tips

- Press the **EXECUTIVE** button for a business-friendly overview
- Press the **LIST VIEW** button for technical details
- Use **Dark Mode** for comfortable reading
- Filter by **connector** to track specific payment provider updates
- Check the **enhancement progress** indicator to see AI processing status

---

Built with ❤️ using Next.js, TypeScript, and AI
