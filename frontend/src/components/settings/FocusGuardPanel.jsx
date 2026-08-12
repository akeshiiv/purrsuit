/**
 * The realm-wide Focus Guard switch. The copy has to be exact about the
 * mechanic: the screen check runs on the player's own device, it is what makes a
 * session earn coins at all, and a detection ends the session paying nothing.
 */
export default function FocusGuardPanel({ enabled, canEdit, onToggle }) {
  return (
    <div className="mt-4 rounded-[20px] border-2 border-info-edge bg-info px-4 py-[13px]">
      <div className="flex items-center gap-3">
        <button
          aria-checked={enabled}
          aria-label="Focus Guard"
          className={`flex h-7 w-[52px] flex-none items-center rounded-full border-2 px-[3px] ${
            enabled ? 'justify-end border-blue-edge bg-blue' : 'justify-start border-edge-soft bg-track'
          } ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed opacity-45'}`}
          disabled={!canEdit}
          onClick={() => onToggle(!enabled)}
          role="switch"
          type="button"
        >
          <span aria-hidden="true" className="block size-5 rounded-full bg-raised" />
        </button>
        <div>
          <p className="text-[13.5px] font-extrabold text-[#2F5F82]">Focus Guard</p>
          <p className="mt-px text-[11.5px] font-bold text-[#4F7EA0]">
            On-device screen checks during study sessions
          </p>
        </div>
      </div>
      <p className="mt-[10px] text-[11.5px] font-bold text-[#4F7EA0]">
        Frames are checked on this machine and never leave it. The check is required to earn coins — if a
        distraction is detected the session ends early and pays nothing: no coins, no study time, no streak.
      </p>
      {!canEdit && (
        <p className="mt-2 text-[11.5px] font-bold text-[#4F7EA0]">Only the realm admin can change this.</p>
      )}
    </div>
  );
}
