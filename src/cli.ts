import 'dotenv/config'
import { cadToSdtf } from './cadToSdtf.js';
import { sdtfToGltf } from './sdtfToGltf.js';

async function cli() {
    if (process.argv.length < 5) {
        console.error('Usage: node dist/cli.js [cadToSdtf|sdtfToGltf] <filepathIn> <filepathOut>', process.argv);
        process.exit(1);
    }

    const command = process.argv[2];
    if (command !== 'cadToSdtf' && command !== 'sdtfToGltf') {
        console.error('Invalid command. Use cadToSdtf or sdtfToGltf');
        process.exit(1);
    }

    const filepathIn = process.argv[3];
    const filepathOut = process.argv[4];

    const modelViewUrl = process.env.MODEL_VIEW_URL;
    const ticket = command === 'cadToSdtf' ? process.env.BACKEND_TICKET_CAD_TO_SDTF : process.env.BACKEND_TICKET_SDTF_TO_GLTF;
    if (!modelViewUrl || !ticket) {
        console.error('MODEL_VIEW_URL and BACKEND_TICKET environment variables must be set in .env file');
        process.exit(1);
    }

    if (command === 'cadToSdtf') {
        await cadToSdtf({ filepathIn, filepathOut, modelViewUrl, ticket });
    } else if (command === 'sdtfToGltf') {
        await sdtfToGltf({ filepathIn, filepathOut, modelViewUrl, ticket });
    } else {
        console.error(`Command ${command} not implemented`);
        process.exit(1);
    }
}

(async () => {
    await cli();
})();
