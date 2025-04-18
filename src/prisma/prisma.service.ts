import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from 'generated/prisma';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit , OnModuleDestroy {
    constructor(){
        super()
    }

    async onModuleInit() {
        await this.$connect();
        console.log("Connected to database")
    }
    async onModuleDestroy() {
        await this.$disconnect();
    }
}
