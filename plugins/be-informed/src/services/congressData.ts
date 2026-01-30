import { XMLParser } from "fast-xml-parser";

interface SenatorVote {
  member_full: string;
  last_name: string;
  party: string;
  state: string;
  vote_cast: string;
}

// 1. The Senate XML Fetcher
async function getSenateVote(
  congress: number,
  session: number,
  voteNum: number,
) {
  // Pad the vote number to 5 digits (e.g., 6 -> "00006")
  const paddedNum = voteNum.toString().padStart(5, "0");

  const url = `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${congress}${session}/vote_${congress}_${session}_${paddedNum}.xml`;

  try {
    const res = await fetch(url);
    if (res.status === 404) return null; // Vote doesn't exist yet

    const xml = await res.text();
    const parser = new XMLParser();
    const data = parser.parse(xml);

    // 2. Parse the "Messy" XML
    // Structure: <roll_call_vote> <members> <member> ...
    const voteInfo = data.roll_call_vote;
    const members = voteInfo.members.member;

    return {
      question: voteInfo.vote_question_text,
      result: voteInfo.vote_result_text,
      date: voteInfo.vote_date,
      votes: members.map((m: any) => ({
        member_full: `${m.first_name} ${m.last_name}`,
        last_name: m.last_name,
        party: m.party,
        state: m.state,
        vote_cast: m.vote_cast,
      })) as SenatorVote[],
    };
  } catch (err) {
    console.error(`Failed to fetch Senate Vote ${voteNum}:`, err);
    return null;
  }
}

export async function getMemberById(id: string) {
  const url = `https://api.congress.gov/v3/member/${id}?format=json&api_key=${process.env.GOV_DATA_API_KEY}`;
  const res = await fetch(url);
  const data = (await res.json()) as any;
  if (!data?.member) return null;
  return {
    image: data.member?.depiction?.imageUrl,
    terms: data.member?.terms,
    leadership: data.member?.leadership,
    partyHistory: data.member?.partyHistory,
    sponsoredLegislation: data.member?.sponsoredLegislation?.count,
    cosponsoredLegislation: data.member?.cosponsoredLegislation?.count,
  };
}
