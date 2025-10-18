import AudioPlayer from '../components/AudioPlayer';

export default function HomePage() {
  return (
    <div className="space-y-10">
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        <form className="space-y-6">
          <div>
            <label htmlFor="style" className="label">
              Style
            </label>
            <select id="style" name="style" className="select" defaultValue="ambient">
              <option value="ambient">Ambient</option>
              <option value="electronic">Electronic</option>
              <option value="pop">Pop</option>
              <option value="hiphop">Hip-Hop</option>
              <option value="rock">Rock</option>
              <option value="jazz">Jazz</option>
              <option value="classical">Classical</option>
            </select>
            <p className="helper">Choose a music style or genre.</p>
          </div>

          <div>
            <label htmlFor="lyrics" className="label">
              Lyrics or prompt
            </label>
            <textarea
              id="lyrics"
              name="lyrics"
              className="textarea"
              placeholder="Describe the mood, instruments, or paste lyrics..."
            />
            <p className="helper">Optional. The AI will use this to guide the composition.</p>
          </div>

          <div>
            <label htmlFor="duration" className="label">
              Duration (seconds)
            </label>
            <input
              id="duration"
              name="duration"
              type="number"
              min={30}
              max={600}
              step={5}
              defaultValue={180}
              className="input"
            />
            <p className="helper">Default is 180 seconds (3 minutes). Range: 30–600.</p>
          </div>

          <div className="flex items-center gap-3">
            <button type="submit" className="button" disabled>
              Generate
            </button>
            <span className="text-xs text-gray-400">Disabled until API is implemented</span>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        <h2 className="mb-3 text-lg font-semibold">Preview</h2>
        <AudioPlayer />
      </section>
    </div>
  );
}
