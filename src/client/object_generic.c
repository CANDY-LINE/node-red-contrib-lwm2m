/**
 * @license
 * Copyright (c) 2017 CANDY LINE INC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#include "liblwm2m.h"
#include "lwm2mclient.h"

#include <string.h>
#include <stdlib.h>
#include <unistd.h>
#include <stdio.h>
#include <ctype.h>
#include <sys/select.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <netdb.h>
#include <sys/stat.h>
#include <errno.h>
#include <signal.h>

typedef struct
{
    uint8_t objectId;
} parent_context_t;

static parent_context_t * setup_parent_context(uint8_t objectId)
{
    parent_context_t * context = (parent_context_t *)lwm2m_malloc(sizeof(parent_context_t));
    // TODO
    context->objectId = objectId;
    return context;
}

static uint8_t prv_generic_read(uint16_t instanceId,
                                int * numDataP,
                                lwm2m_data_t ** dataArrayP,
                                lwm2m_object_t * objectP)
{
    uint8_t result = 0;
    parent_context_t * context = (parent_context_t *)objectP->userData;
    // TODO
    return result;
}

static uint8_t prv_generic_discover(uint16_t instanceId,
                                    int * numDataP,
                                    lwm2m_data_t ** dataArrayP,
                                    lwm2m_object_t * objectP)
{
    uint8_t result = 0;
    parent_context_t * context = (parent_context_t *)objectP->userData;
    // TODO
    return result;
}

static uint8_t prv_generic_write(uint16_t instanceId,
                                 int numData,
                                 lwm2m_data_t * dataArray,
                                 lwm2m_object_t * objectP)
{
    uint8_t result = 0;
    parent_context_t * context = (parent_context_t *)objectP->userData;
    // TODO
    return result;
}

static uint8_t prv_generic_execute(uint16_t instanceId,
                                   uint16_t resourceId,
                                   uint8_t * buffer,
                                   int length,
                                   lwm2m_object_t * objectP)
{
    uint8_t result = 0;
    parent_context_t * context = (parent_context_t *)objectP->userData;
    // TODO
    return result;
}

static uint8_t prv_generic_create(uint16_t instanceId,
                                  int numData,
                                  lwm2m_data_t * dataArray,
                                  lwm2m_object_t * objectP)
{
    uint8_t result = 0;
    parent_context_t * context = (parent_context_t *)objectP->userData;
    // TODO
    return result;
}

static uint8_t prv_generic_delete(uint16_t instanceId,
                                  lwm2m_object_t * objectP)
{
    uint8_t result = 0;
    parent_context_t * context = (parent_context_t *)objectP->userData;
    // TODO
    return result;
}

lwm2m_object_t * get_object(uint8_t objectId)
{
    lwm2m_object_t * genericObj = (lwm2m_object_t *)lwm2m_malloc(sizeof(lwm2m_object_t));
    if (NULL == genericObj)
    {
        return NULL;
    }
    memset(genericObj, 0, sizeof(lwm2m_object_t));

    parent_context_t * context = setup_parent_context(objectId);
    if (NULL != context)
    {
        genericObj->userData = context;
    }
    else
    {
        free_object(genericObj);
        return NULL;
    }

    // TODO Setup Instances
    genericObj->instanceList = (lwm2m_list_t *)lwm2m_malloc(sizeof(lwm2m_list_t));
    if (NULL != genericObj->instanceList)
    {
        memset(genericObj->instanceList, 0, sizeof(lwm2m_list_t));
    }
    else
    {
        free_object(genericObj);
        return NULL;
    }

    genericObj->readFunc     = prv_generic_read;
    genericObj->discoverFunc = prv_generic_discover;
    genericObj->writeFunc    = prv_generic_write;
    genericObj->executeFunc  = prv_generic_execute;
    genericObj->createFunc   = prv_generic_create;
    genericObj->deleteFunc   = prv_generic_delete;

    return genericObj;
}

void free_object(lwm2m_object_t * objectP)
{
    if (NULL != objectP) {
        if (NULL != objectP->userData) {
            lwm2m_free(objectP->userData);
        }
        if (NULL != objectP->instanceList) {
            lwm2m_list_free(objectP->instanceList);
        }
        lwm2m_free(objectP);
    }
}

void handle_value_changed(lwm2m_context_t * lwm2mH,
                          lwm2m_uri_t * uri,
                          const char * value,
                          size_t valueLength)
{
    // TODO rewrite entire code
    lwm2m_object_t * object = (lwm2m_object_t *)LWM2M_LIST_FIND(lwm2mH->objectList, uri->objectId);

    if (NULL != object)
    {
        if (object->writeFunc != NULL)
        {
            lwm2m_data_t * dataP;
            int result;

            dataP = lwm2m_data_new(1);
            if (dataP == NULL)
            {
                fprintf(stderr, "Internal allocation failure !\n");
                return;
            }
            dataP->id = uri->resourceId;
            lwm2m_data_encode_nstring(value, valueLength, dataP);

            result = object->writeFunc(uri->instanceId, 1, dataP, object);
            if (COAP_405_METHOD_NOT_ALLOWED == result)
            {
                switch (uri->objectId)
                {
                case LWM2M_DEVICE_OBJECT_ID:
                    result = device_change(dataP, object);
                    break;
                default:
                    break;
                }
            }

            if (COAP_204_CHANGED != result)
            {
                fprintf(stderr, "Failed to change value!\n");
            }
            else
            {
                fprintf(stderr, "value changed!\n");
                lwm2m_resource_value_changed(lwm2mH, uri);
            }
            lwm2m_data_free(1, dataP);
            return;
        }
        else
        {
            fprintf(stderr, "write not supported for specified resource!\n");
        }
        return;
    }
    else
    {
        fprintf(stderr, "Object not found !\n");
    }
}
