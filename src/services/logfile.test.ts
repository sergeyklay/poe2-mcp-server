import { describe, it, expect } from 'vitest';
import { decodeZoneCode, parseClientLog } from './logfile.js';

describe('decodeZoneCode', () => {
  it.each([
    {
      areaId: 'G3_10',
      expected: {
        act: 3,
        areaIndex: 10,
        suffix: null,
        description: 'Act 3, area 10',
        englishName: 'The Trial of Chaos',
      },
    },
    {
      areaId: 'G1_town',
      expected: {
        act: 1,
        areaIndex: null,
        suffix: null,
        description: 'Act 1 Town',
        englishName: 'Clearfell Encampment',
      },
    },
    {
      areaId: 'G3_10_Airlock',
      expected: {
        act: 3,
        areaIndex: 10,
        suffix: 'Airlock',
        description: 'Act 3, area 10 [Airlock]',
        englishName: 'Temple of Chaos (Entrance)',
      },
    },
    {
      areaId: 'G2_1',
      expected: {
        act: 2,
        areaIndex: 1,
        suffix: null,
        description: 'Act 2, area 1',
        englishName: 'Mawdun Quarry',
      },
    },
  ])('decodes $areaId correctly', ({ areaId, expected }) => {
    const result = decodeZoneCode(areaId);

    expect(result).toEqual(expected);
  });

  it('returns null for non-matching area IDs', () => {
    expect(decodeZoneCode('Invalid')).toBeNull();
    expect(decodeZoneCode('Zone_1_2')).toBeNull();
    expect(decodeZoneCode('')).toBeNull();
  });

  it('returns englishName as null when zone is not in ZONE_NAMES', () => {
    const result = decodeZoneCode('G99_999');

    expect(result?.englishName).toBeNull();
    expect(result?.act).toBe(99);
    expect(result?.areaIndex).toBe(999);
  });
});

describe('parseClientLog', () => {
  it('parses zone generation events', () => {
    const lines = [
      '2026/02/23 18:00:00 12345 abc123 [DEBUG Client 1234] Generating level 38 area "G3_10" with seed 999',
    ];

    const result = parseClientLog(lines);

    expect(result.zoneVisits).toHaveLength(1);
    expect(result.zoneVisits[0]).toMatchObject({
      areaId: 'G3_10',
      areaLevel: 38,
      zoneName: null,
    });
    expect(result.zoneVisits[0]?.decoded?.englishName).toBe('The Trial of Chaos');
    expect(result.lastZone?.areaId).toBe('G3_10');
  });

  it('attaches localized zone name from SCENE message', () => {
    const lines = [
      '2026/02/23 18:00:00 12345 abc123 [DEBUG Client 1234] Generating level 38 area "G3_10" with seed 999',
      '2026/02/23 18:00:01 12346 abc124 [INFO Client 1234] [SCENE] Set Source [Испытание Хаоса]',
    ];

    const result = parseClientLog(lines);

    expect(result.zoneVisits[0]?.zoneName).toBe('Испытание Хаоса');
  });

  it('skips placeholder zone names like (null) and (unknown)', () => {
    const lines = [
      '2026/02/23 18:00:00 12345 abc123 [DEBUG Client 1234] Generating level 38 area "G3_10" with seed 999',
      '2026/02/23 18:00:01 12346 abc124 [INFO Client 1234] [SCENE] Set Source [(null)]',
      '2026/02/23 18:00:02 12347 abc125 [INFO Client 1234] [SCENE] Set Source [(unknown)]',
      '2026/02/23 18:00:03 12348 abc126 [INFO Client 1234] [SCENE] Set Source [Real Zone Name]',
    ];

    const result = parseClientLog(lines);

    expect(result.zoneVisits[0]?.zoneName).toBe('Real Zone Name');
  });

  it('categorizes player events (colon prefix)', () => {
    const lines = [
      '2026/02/23 18:00:00 12345 abc123 [INFO Client 1234] : NewBrewess was slain.',
      '2026/02/23 18:00:01 12346 abc124 [INFO Client 1234] : NewBrewess (Witch) is now level 38',
    ];

    const result = parseClientLog(lines);

    expect(result.playerEvents).toHaveLength(2);
    expect(result.playerEvents[0]).toMatchObject({
      category: 'player',
      rawMessage: 'NewBrewess was slain.',
    });
    expect(result.playerEvents[1]).toMatchObject({
      category: 'player',
      rawMessage: 'NewBrewess (Witch) is now level 38',
    });
  });

  it('categorizes trade chat events (hash prefix)', () => {
    const lines = [
      '2026/02/23 18:00:00 12345 abc123 [INFO Client 1234] #SomePlayer: WTS cheap items',
    ];

    const result = parseClientLog(lines);

    expect(result.playerEvents).toHaveLength(1);
    expect(result.playerEvents[0]).toMatchObject({
      category: 'trade_chat',
      rawMessage: '#SomePlayer: WTS cheap items',
    });
  });

  it('categorizes whisper events (at prefix)', () => {
    const lines = ['2026/02/23 18:00:00 12345 abc123 [INFO Client 1234] @FromPlayer: hello'];

    const result = parseClientLog(lines);

    expect(result.playerEvents).toHaveLength(1);
    expect(result.playerEvents[0]).toMatchObject({
      category: 'whisper',
      rawMessage: '@FromPlayer: hello',
    });
  });

  it('tracks session boundaries from LOG FILE OPENING', () => {
    const lines = [
      '2026/02/23 17:00:00 ***** LOG FILE OPENING *****',
      '2026/02/23 17:30:00 12345 abc123 [INFO Client 1234] : Some event',
      '2026/02/23 18:00:00 ***** LOG FILE OPENING *****',
      '2026/02/23 18:30:00 12346 abc124 [INFO Client 1235] : Another event',
    ];

    const result = parseClientLog(lines);

    expect(result.sessions).toHaveLength(2);
    expect(result.sessions[0]?.startTime.getHours()).toBe(17);
    expect(result.sessions[0]?.endTime?.getHours()).toBe(17);
    expect(result.sessions[1]?.startTime.getHours()).toBe(18);
    expect(result.sessions[1]?.endTime?.getHours()).toBe(18);
  });

  it('returns correct summary counts', () => {
    const lines = [
      '2026/02/23 17:00:00 ***** LOG FILE OPENING *****',
      '2026/02/23 18:00:00 12345 abc123 [DEBUG Client 1234] Generating level 10 area "G1_1" with seed 1',
      '2026/02/23 18:01:00 12346 abc124 [DEBUG Client 1234] Generating level 11 area "G1_2" with seed 2',
      '2026/02/23 18:02:00 12347 abc125 [INFO Client 1234] : Death event',
      '2026/02/23 18:03:00 12348 abc126 [INFO Client 1234] : Level up event',
    ];

    const result = parseClientLog(lines);

    expect(result.summary).toEqual({
      totalPlayerEvents: 2,
      totalZoneVisits: 2,
      totalSessions: 1,
    });
  });

  it('handles empty input', () => {
    const result = parseClientLog([]);

    expect(result.sessions).toHaveLength(0);
    expect(result.zoneVisits).toHaveLength(0);
    expect(result.playerEvents).toHaveLength(0);
    expect(result.lastZone).toBeNull();
  });

  it('skips malformed lines', () => {
    const lines = [
      'Not a valid log line',
      '',
      '   ',
      '2026/02/23 18:00:00 12345 abc123 [INFO Client 1234] : Valid event',
    ];

    const result = parseClientLog(lines);

    expect(result.playerEvents).toHaveLength(1);
    expect(result.playerEvents[0]?.rawMessage).toBe('Valid event');
  });
});
