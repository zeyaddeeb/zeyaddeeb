export const HYDROGEN_S = 7.04024183647e-10;

export interface Inscribed {
	bits: string;
	zeros: number;
}

export const rotation: Inscribed = { bits: "10011000011001", zeros: 19 };
export const side: Inscribed = { bits: "100001011", zeros: 34 };
export const line: Inscribed = { bits: "101101001100", zeros: 12 };
export const LINES = 512;

export const ticks = (n: Inscribed) => BigInt(`0b${n.bits}`) << BigInt(n.zeros);
export const seconds = (n: Inscribed) => Number(ticks(n)) * HYDROGEN_S;
export const full = (n: Inscribed) => n.bits + "0".repeat(n.zeros);

export interface Pulsar {
	id: string;
	name: string;
	bits: string;
	angle: number;
	length: number;
	nickname?: string;
}

export const pulsars: Pulsar[] = [
	{
		id: "1727",
		name: "B1727−47",
		bits: "1000110001111100100011011101010",
		angle: 17,
		length: 0.51,
	},
	{
		id: "1451",
		name: "B1451−68",
		bits: "10110010011000101011101101111",
		angle: 49,
		length: 0.21,
	},
	{
		id: "1240",
		name: "B1240−64",
		bits: "100000110110010110001001111000",
		angle: 58,
		length: 0.52,
	},
	{
		id: "0833",
		name: "B0833−45",
		bits: "111100011011011001010100111",
		angle: 95,
		length: 0.33,
		nickname: "Vela",
	},
	{
		id: "0950",
		name: "B0950+08",
		bits: "10101011011001101100101000011",
		angle: 129,
		length: 0.21,
	},
	{
		id: "0823",
		name: "B0823+26",
		bits: "101100111011010101011110001011",
		angle: 162,
		length: 0.24,
	},
	{
		id: "0531",
		name: "B0531+21",
		bits: "10110011100000101010000010",
		angle: 174,
		length: 0.39,
		nickname: "Crab",
	},
	{
		id: "0525",
		name: "B0525+21",
		bits: "100111101000110101000100111000100",
		angle: 177,
		length: 0.36,
	},
	{
		id: "0328",
		name: "B0329+54",
		bits: "111100011111100011111000010110",
		angle: -145,
		length: 0.25,
	},
	{
		id: "2217",
		name: "B2217+47",
		bits: "101101100101101001000010110001",
		angle: -97,
		length: 0.31,
	},
	{
		id: "2016",
		name: "B2016+28",
		bits: "101111001111001110011000001101",
		angle: -68,
		length: 0.22,
	},
	{
		id: "1933",
		name: "B1933+16",
		bits: "11110010111110001110100011110",
		angle: -52,
		length: 0.55,
	},
	{
		id: "1929",
		name: "B1929+10",
		bits: "10011001011010111010010111000",
		angle: -45,
		length: 0.22,
	},
	{
		id: "1642",
		name: "B1642−03",
		bits: "100000110100101010001110101100",
		angle: -16,
		length: 0.3,
	},
];

export const period = (p: Pulsar) => Number.parseInt(p.bits, 2) * HYDROGEN_S;

export const grouped = (n: bigint | number) => n.toLocaleString("en-US");
